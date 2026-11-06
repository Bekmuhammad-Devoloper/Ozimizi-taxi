// Mirror of backend/src/common/utils/fare.ts — the live estimate must match
// what the server charges at the end of the ride.
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'store.dart';
import 'util.dart';

typedef Tariff = Map<String, dynamic>;

double computeFare(double distanceKm, Tariff t) {
  final km = distanceKm < 0 ? 0.0 : distanceKm;
  final step = numOf(t['roundTo'], 1000);
  final tiers = ((t['tiers'] as List?) ?? const [])
      .map((x) => [numOf(x['uptoKm']), numOf(x['price'])])
      .where((x) => x[0] > 0 && x[1] >= 0)
      .toList()
    ..sort((a, b) => a[0].compareTo(b[0]));
  final perKm = numOf(t['pricePerKm']);
  double raw;
  if (tiers.isNotEmpty) {
    final hit = tiers.where((x) => km <= x[0]);
    final last = tiers.last;
    raw = hit.isNotEmpty ? hit.first[1] : last[1] + (km - last[0]) * perKm;
  } else {
    final byKm = km * perKm;
    final min = numOf(t['minimumFare']);
    raw = byKm > min ? byKm : min;
  }
  return (raw / step).round() * step;
}

/// True when the admin drew a zone and set a price for km outside it.
bool zoneActive(Tariff? t) {
  final poly = t?['zonePolygon'];
  return poly is List && poly.length >= 3 && numOf(t?['outsidePricePerKm']) > 0;
}

bool insidePolygon(double lat, double lng, List poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    final aLat = numOf(poly[i]['lat']), aLng = numOf(poly[i]['lng']);
    final bLat = numOf(poly[j]['lat']), bLng = numOf(poly[j]['lng']);
    if ((aLng > lng) != (bLng > lng) && lat < (bLat - aLat) * (lng - aLng) / (bLng - aLng) + aLat) {
      inside = !inside;
    }
  }
  return inside;
}

/// Km inside by the normal tariff, km outside at the admin's outside price.
double computeZonedFare(double totalKm, double outsideKm, Tariff t) {
  if (!zoneActive(t)) return computeFare(totalKm, t);
  final total = totalKm < 0 ? 0.0 : totalKm;
  final outside = outsideKm < 0 ? 0.0 : (outsideKm > total ? total : outsideKm);
  final step = numOf(t['roundTo'], 1000);
  return computeFare(total - outside, t) + (outside * numOf(t['outsidePricePerKm']) / step).round() * step;
}

double commissionFor(double fare, Tariff t) {
  final pct = numOf(t['commissionPercent']);
  return pct > 0 ? (fare * pct / 100).roundToDouble() : numOf(t['commissionPerOrder']);
}

/// Waiting fee: whole minutes beyond the free ones × price per minute.
double waitFeeFor(double waitSec, Tariff? t) {
  if (t == null) return 0;
  final raw = (waitSec / 60 - numOf(t['waitingFreeMinutes'])).ceil();
  return (raw < 0 ? 0 : raw) * numOf(t['waitingPricePerMinute']);
}

// ---- server clock ---------------------------------------------------------
// Waiting / ride timers subtract server timestamps from "now". A phone whose
// clock is off made the timer jump, so keep an estimate of (device − server).
final List<int> _offsets = [];
int _clockOffsetMs = 0;

void noteServerTime(dynamic iso) {
  final t = iso == null ? null : DateTime.tryParse(iso.toString());
  if (t == null) return;
  _offsets.add(DateTime.now().millisecondsSinceEpoch - t.millisecondsSinceEpoch);
  if (_offsets.length > 8) _offsets.removeAt(0);
  _clockOffsetMs = _offsets.reduce((a, b) => a < b ? a : b);
}

int serverNow() => DateTime.now().millisecondsSinceEpoch - _clockOffsetMs;

bool isWaitCounting(Map<String, dynamic>? o) {
  if (o == null) return false;
  return o['status'] == 'ARRIVED' || (o['status'] == 'IN_PROGRESS' && o['waitStartedAt'] != null);
}

/// The server's metered total plus the time since its last tick — unless the
/// car was moving at that tick (then it is not counted).
double liveWaitSec(Map<String, dynamic> o, [int? now]) {
  final base = numOf(o['waitingSeconds']);
  if (!isWaitCounting(o) || o['waitMoving'] == true) return base;
  final since = o['waitTickAt'] ?? (o['status'] == 'ARRIVED' ? o['arrivedAt'] : o['waitStartedAt']);
  final t = since == null ? null : DateTime.tryParse(since.toString());
  if (t == null) return base;
  final d = ((now ?? serverNow()) - t.millisecondsSinceEpoch) / 1000;
  return base + (d < 0 ? 0 : d);
}

// ---- tariff cache ---------------------------------------------------------
const _tariffKey = 'moviy-driver-tariff';
Tariff? cachedTariff;

/// Kept on the phone so a running meter still shows the fare without network.
Future<Tariff?> loadTariff() async {
  final p = await SharedPreferences.getInstance();
  final raw = p.getString(_tariffKey);
  if (raw != null && cachedTariff == null) {
    try {
      cachedTariff = (jsonDecode(raw) as Map).cast<String, dynamic>();
    } catch (_) {}
  }
  try {
    final r = await api.get('/driver/tariff');
    if (r.data is Map) {
      cachedTariff = (r.data as Map).cast<String, dynamic>();
      await p.setString(_tariffKey, jsonEncode(r.data));
      orders.touch();
    }
  } catch (_) {}
  return cachedTariff;
}

bool isOutsideZone(double lat, double lng) {
  final t = cachedTariff;
  return t != null && zoneActive(t) && !insidePolygon(lat, lng, t['zonePolygon'] as List);
}
