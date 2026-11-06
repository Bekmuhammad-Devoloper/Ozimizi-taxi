import 'dart:async';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'live.dart';
import 'native.dart';

/// Voice navigation: a driving route with its turns, and a tracker that follows
/// the driver along it and decides what to say. Same logic as the web app's
/// driver-pwa/src/lib/voice-nav.ts; keep the two in step.
class Pt {
  final double lat;
  final double lng;
  const Pt(this.lat, this.lng);
}

class Maneuver {
  double at;
  final List<String> clips;
  final String text;
  final String icon;
  final String street;
  final bool arrive;
  Maneuver({required this.at, required this.clips, required this.text, required this.icon, this.street = '', this.arrive = false});
}

class NavRoute {
  final List<Pt> line;
  final List<double> cum;
  final double total;
  final double durationSec;
  final List<Maneuver> maneuvers;
  const NavRoute(this.line, this.cum, this.total, this.durationSec, this.maneuvers);
}

class NavUpdate {
  final Maneuver next;
  final double distM;
  final double remainM;
  final double remainSec;
  final double offRouteM;
  final bool lost;
  final List<String>? say;
  const NavUpdate(this.next, this.distM, this.remainM, this.remainSec, this.offRouteM, this.lost, this.say);
}

const _r = 6371000.0;
double _rad(double d) => d * math.pi / 180;

double distM(Pt a, Pt b) {
  final x = _rad(b.lng - a.lng) * math.cos(_rad((a.lat + b.lat) / 2));
  final y = _rad(b.lat - a.lat);
  return math.sqrt(x * x + y * y) * _r;
}

const _text = {
  'left': 'Chapga buriling',
  'right': 'O‘ngga buriling',
  'slight_left': 'Biroz chapga buriling',
  'slight_right': 'Biroz o‘ngga buriling',
  'sharp_left': 'Keskin chapga buriling',
  'sharp_right': 'Keskin o‘ngga buriling',
  'uturn': 'Orqaga qayriling',
  'straight': 'To‘g‘riga yuring',
  'keep_left': 'Chap tomondan yuring',
  'keep_right': 'O‘ng tomondan yuring',
};

Maneuver _turn(String key, double at, String street) =>
    Maneuver(at: at, clips: [key], text: _text[key]!, icon: key, street: street);

String? _turnKey(String? m) => const {
      'left': 'left',
      'right': 'right',
      'slight left': 'slight_left',
      'slight right': 'slight_right',
      'sharp left': 'sharp_left',
      'sharp right': 'sharp_right',
      'uturn': 'uturn',
    }[m];

/// What a route step asks of the driver; null when there is nothing to say.
Maneuver? _describe(String type, String? modifier, Object? exit, double at, String street) {
  switch (type) {
    case 'arrive':
      return Maneuver(at: at, clips: const [], text: 'Yetib keldingiz', icon: 'arrive', arrive: true);
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      final n = exit is num ? exit.toInt() : 0;
      return Maneuver(
        at: at,
        clips: n >= 1 && n <= 4 ? ['roundabout', 'exit$n'] : const ['roundabout'],
        text: n >= 1 ? 'Aylanma yo‘l: $n-chiqish' : 'Aylanma yo‘lga kiring',
        icon: 'roundabout',
        street: street,
      );
    case 'exit roundabout':
    case 'exit rotary':
    case 'new name':
    case 'notification':
    case 'use lane':
    case 'depart':
      return null;
    case 'fork':
    case 'merge':
    case 'on ramp':
    case 'off ramp':
      if (modifier?.contains('left') == true) return _turn('keep_left', at, street);
      if (modifier?.contains('right') == true) return _turn('keep_right', at, street);
      return null;
    case 'continue':
      final k = _turnKey(modifier);
      return k == null ? null : _turn(k, at, street);
    default:
      // "turn", "end of road".
      return _turn(_turnKey(modifier) ?? 'straight', at, street);
  }
}

double _num(Object? v) => v is num ? v.toDouble() : 0;

/// Reads an OSRM answer (`steps=true&geometries=geojson&overview=full`).
NavRoute? parseRoute(Object? json) {
  try {
    final r = ((json as Map)['routes'] as List).first as Map;
    final coords = (r['geometry'] as Map)['coordinates'] as List;
    final steps = ((r['legs'] as List).first as Map)['steps'] as List;
    if (coords.length < 2 || steps.isEmpty) return null;
    final line = [for (final c in coords) Pt(_num((c as List)[1]), _num(c[0]))];
    final cum = <double>[0];
    for (var i = 1; i < line.length; i++) {
      cum.add(cum[i - 1] + distM(line[i - 1], line[i]));
    }
    final total = cum.last;
    final stepsTotal = steps.fold<double>(0, (s, x) => s + _num((x as Map)['distance']));
    final scale = stepsTotal > 0 ? total / stepsTotal : 1.0;
    final maneuvers = <Maneuver>[];
    var at = 0.0;
    for (final s in steps) {
      final m = ((s as Map)['maneuver'] as Map?) ?? const {};
      final info = _describe('${m['type'] ?? ''}', m['modifier'] as String?, m['exit'], at * scale, '${s['name'] ?? ''}');
      if (info != null) maneuvers.add(info);
      at += _num(s['distance']);
    }
    if (maneuvers.isEmpty || !maneuvers.last.arrive) {
      maneuvers.add(Maneuver(at: total, clips: const [], text: 'Yetib keldingiz', icon: 'arrive', arrive: true));
    } else {
      maneuvers.last.at = total;
    }
    return NavRoute(line, cum, total, _num(r['duration']), maneuvers);
  } catch (_) {
    return null;
  }
}

/// Off the line by more than this many metres, twice in a row: lost.
const _offRouteM = 60.0;

/// A turn this close counts as done.
const _passedM = 5.0;
const _nothingSaid = 9;

class NavTracker {
  final NavRoute route;
  final String kind; // 'pickup' | 'dest'
  final bool sayStart;
  int _seg = 0;
  double _along = 0;
  int _idx = 0;
  bool _first = true;
  int _offCount = 0;
  late final List<int> _spoken = List.filled(route.maneuvers.length, _nothingSaid);

  NavTracker(this.route, this.kind, {this.sayStart = true});

  /// Nearest place on the line, looking just ahead of the last one (roads can double back).
  ({int seg, double along, double off}) _scan(Pt p, int from, int to) {
    final line = route.line, cum = route.cum;
    final k = math.cos(_rad(p.lat));
    var seg = from;
    var along = 0.0;
    var best = double.infinity;
    for (var i = from; i <= to; i++) {
      final ax = _rad(line[i].lng - p.lng) * k * _r;
      final ay = _rad(line[i].lat - p.lat) * _r;
      final bx = _rad(line[i + 1].lng - p.lng) * k * _r;
      final by = _rad(line[i + 1].lat - p.lat) * _r;
      final dx = bx - ax, dy = by - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 > 0 ? (-(ax * dx + ay * dy) / len2).clamp(0.0, 1.0) : 0.0;
      final qx = ax + t * dx, qy = ay + t * dy;
      final off = math.sqrt(qx * qx + qy * qy);
      if (off < best) {
        best = off;
        seg = i;
        along = cum[i] + t * (cum[i + 1] - cum[i]);
      }
    }
    return (seg: seg, along: along, off: best);
  }

  List<String>? _phrase(int i, double d) {
    final m = route.maneuvers[i];
    if (m.arrive) {
      if (d > 40 || _spoken[i] == 0) return null;
      _spoken[i] = 0;
      return [kind == 'pickup' ? 'arrive_pickup' : 'arrive_dest'];
    }
    final fresh = _spoken[i] == _nothingSaid;
    int rank;
    String clip;
    if (d <= 40) {
      rank = 0;
      clip = 'now';
    } else if (d <= 130) {
      rank = 1;
      clip = 'd100';
    } else if (d <= 330) {
      rank = 2;
      clip = fresh && d <= 230 ? 'd200' : 'd300';
    } else if (d <= 1050) {
      rank = 3;
      clip = fresh && d <= 650 ? 'd500' : 'd1000';
    } else if (d <= 2100 && fresh) {
      rank = 4;
      clip = 'd2000';
    } else {
      return null;
    }
    if (rank >= _spoken[i]) return null;
    _spoken[i] = rank;
    return [clip, ...m.clips];
  }

  NavUpdate update(Pt p) {
    final mans = route.maneuvers;
    final lastSeg = route.line.length - 2;
    var loc = _scan(p, math.max(0, _seg - 5), math.min(lastSeg, _seg + 60));
    if (loc.off > _offRouteM) {
      // Back on the line somewhere else (a shortcut)?
      final all = _scan(p, 0, lastSeg);
      if (all.off <= _offRouteM) loc = all;
    }
    // Off the line we stay at the last place on it: a turn further along must
    // not count as passed just because that part of the line is the nearest.
    if (loc.off <= _offRouteM) {
      _seg = loc.seg;
      _along = loc.along;
    }
    _offCount = loc.off > _offRouteM ? _offCount + 1 : 0;

    final before = _idx;
    while (_idx < mans.length - 1 && mans[_idx].at - _along <= _passedM) {
      _idx++;
    }
    final next = mans[_idx];
    final d = math.max(0.0, next.at - _along);

    var say = _offCount > 0 ? null : _phrase(_idx, d);
    if (say == null && _idx > before && !next.arrive && d > 1050) say = const ['continue'];
    if (_first) {
      _first = false;
      if (sayStart) say = ['start', ...?say];
    }
    final remainM = math.max(0.0, route.total - _along);
    return NavUpdate(
      next,
      d,
      remainM,
      route.total > 0 ? route.durationSec * remainM / route.total : 0,
      loc.off,
      _offCount >= 2,
      say,
    );
  }
}

String routeUrl(Pt from, Pt to) =>
    'https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true';

String fmtDist(double m) {
  if (m >= 1000) return '${(m / 1000).toStringAsFixed(1)} km';
  return '${math.max(0, (m / 10).round() * 10)} m';
}

const _muteKey = 'moviy-nav-muted';

/// Follows the driver to a point and says the turns in Uzbek. Silent while the
/// app is in the background (the driver may be listening to Yandex Navigator).
class VoiceNav extends ChangeNotifier {
  final _http = Dio(BaseOptions(connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 12)));
  Pt? _to;
  String _kind = 'dest';
  Timer? _timer;
  NavTracker? _tracker;
  bool _fetching = false;
  bool _builtOnce = false;
  bool _onLine = false;
  DateTime? _lastFetchAt;
  int _gen = 0;

  /// off · waiting-gps · routing · failed · ok
  String state = 'off';
  NavUpdate? last;
  Pt? me;
  bool muted = false;
  bool _disposed = false;

  VoiceNav() {
    SharedPreferences.getInstance().then((p) {
      muted = p.getBool(_muteKey) ?? false;
      if (!_disposed) notifyListeners();
    });
  }

  List<Pt>? get line => _tracker?.route.line;

  Future<void> toggleMute() async {
    muted = !muted;
    if (muted) navStop();
    notifyListeners();
    (await SharedPreferences.getInstance()).setBool(_muteKey, muted);
  }

  /// Safe to call on every rebuild: only a different target starts anything.
  void follow(Pt? to, String kind) {
    if (to?.lat == _to?.lat && to?.lng == _to?.lng && kind == _kind) return;
    _to = to;
    _kind = kind;
    _gen++;
    _timer?.cancel();
    _tracker = null;
    _builtOnce = false;
    _onLine = false;
    _lastFetchAt = null;
    last = null;
    me = null;
    navStop();
    state = to == null ? 'off' : 'waiting-gps';
    if (to != null) {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    }
    // Called from build: listeners hear about it after the frame.
    scheduleMicrotask(() {
      if (!_disposed) notifyListeners();
    });
  }

  void _say(List<String>? clips) {
    if (clips == null || clips.isEmpty || muted) return;
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) return;
    navSay(clips);
  }

  Future<void> _build(Pt from) async {
    if (_fetching) return;
    _fetching = true;
    _lastFetchAt = DateTime.now();
    final gen = _gen;
    try {
      final r = await _http.get<Object>(routeUrl(from, _to!));
      if (gen != _gen) return;
      final parsed = parseRoute(r.data);
      if (parsed == null) throw StateError('no route');
      _tracker = NavTracker(parsed, _kind, sayStart: !_builtOnce);
      if (_builtOnce) _say(const ['reroute']);
      _builtOnce = true;
      _onLine = false;
    } catch (_) {
      if (gen == _gen && _tracker == null) {
        state = 'failed';
        notifyListeners();
      }
    } finally {
      _fetching = false;
    }
  }

  void _tick() {
    final fix = live.lastKnown(const Duration(seconds: 20));
    if (fix == null) {
      if (_tracker == null && state != 'failed' && state != 'waiting-gps') {
        state = 'waiting-gps';
        notifyListeners();
      }
      return;
    }
    me = Pt(fix['lat']!, fix['lng']!);
    if (_tracker == null) {
      // First route, or a retry after the routing server failed.
      final since = _lastFetchAt == null ? null : DateTime.now().difference(_lastFetchAt!);
      if (since == null || since.inSeconds > 30) {
        if (state != 'failed') state = 'routing';
        notifyListeners();
        _build(me!);
      }
      return;
    }
    final u = _tracker!.update(me!);
    if (u.offRouteM < 40) _onLine = true;
    // Parked in a yard the phone is off the line from the start: don't keep rebuilding.
    final wait = _onLine ? 20 : 60;
    if (u.lost && DateTime.now().difference(_lastFetchAt!).inSeconds > wait) _build(me!);
    _say(u.say);
    last = u;
    state = 'ok';
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _gen++;
    _timer?.cancel();
    navStop();
    super.dispose();
  }
}
