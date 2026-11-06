import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/lang.dart';
import '../core/util.dart';
import '../core/voice_nav.dart';

const ink = Color(0xFF0A0A0A);
const paper = Color(0xFFFAFAF9);
const line = Color(0xFFE5E5E5);
const gold = Color(0xFF3B9BFF); // Moviy blue
const goldDark = Color(0xFF1D6FE0);
const goldDeep = Color(0xFF0B3D91);
const n300 = Color(0xFFD4D4D4);
const n400 = Color(0xFFA3A3A3);
const n500 = Color(0xFF737373);
const n600 = Color(0xFF525252);
const red = Color(0xFFDC2626);
const redBg = Color(0xFFFEF2F2);
const redLine = Color(0xFFFECACA);
const redText = Color(0xFFB91C1C);
const green = Color(0xFF15803D);
const greenBg = Color(0xFFF0FDF4);
const greenLine = Color(0xFFBBF7D0);
const orangeBg = Color(0xFFFFF7ED);
const orangeLine = Color(0xFFFED7AA);
const orangeText = Color(0xFF9A3412);

ThemeData appTheme() => ThemeData(
      useMaterial3: true,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(seedColor: gold, primary: goldDark),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: ink)),
        hintStyle: const TextStyle(color: n400),
      ),
    );

/// Text in the app's language.
class T extends StatelessWidget {
  final String text;
  final double size;
  final FontWeight weight;
  final Color? color;
  final TextAlign? align;
  final int? maxLines;
  final double? height;
  final double? spacing;
  const T(this.text, {super.key, this.size = 14, this.weight = FontWeight.w400, this.color, this.align, this.maxLines, this.height, this.spacing});

  @override
  Widget build(BuildContext context) => Text(
        tr(text),
        textAlign: align,
        maxLines: maxLines,
        overflow: maxLines != null ? TextOverflow.ellipsis : null,
        style: TextStyle(
          fontSize: size,
          fontWeight: weight,
          color: color ?? ink,
          height: height,
          letterSpacing: spacing,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      );
}

/// Small uppercase caption.
class Caption extends StatelessWidget {
  final String text;
  final Color color;
  const Caption(this.text, {super.key, this.color = n500});
  @override
  Widget build(BuildContext context) =>
      T(tr(text).toUpperCase(), size: 10, weight: FontWeight.w700, color: color, spacing: 0.8);
}

BoxDecoration cardBox({Color color = Colors.white, Color border = line, double width = 1, double radius = 16}) => BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: border, width: width),
    );

class Section extends StatelessWidget {
  final Widget child;
  final double top;
  final double bottom;
  const Section({super.key, required this.child, this.top = 16, this.bottom = 0});
  @override
  Widget build(BuildContext context) =>
      Padding(padding: EdgeInsets.fromLTRB(24, top, 24, bottom), child: child);
}

/// Dark rounded hero at the top of a screen.
class Hero2 extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const Hero2({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(20, 16, 20, 24)});
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: padding.copyWith(top: padding.top + top),
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
        // Opaque colours: over a transparent one the white page would show through.
        gradient: RadialGradient(center: Alignment(1, -1), radius: 1.2, colors: [Color(0xFF173A5E), ink], stops: [0, 0.8]),
      ),
      child: child,
    );
  }
}

class BackLink extends StatelessWidget {
  final VoidCallback? onTap;
  const BackLink({super.key, this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap ?? () => Navigator.of(context).maybePop(),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(mainAxisSize: MainAxisSize.min, children: const [
            Icon(Icons.arrow_back, size: 18, color: n300),
            SizedBox(width: 6),
            T('Orqaga', color: n300),
          ]),
        ),
      );
}

/// Main action button: blue, tall, full width.
class PrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool busy;
  final bool dark;
  final double height;
  final double fontSize;
  const PrimaryButton(this.label, {super.key, this.icon, this.onTap, this.busy = false, this.dark = false, this.height = 56, this.fontSize = 16});
  @override
  Widget build(BuildContext context) {
    final fg = dark ? gold : ink;
    final bg = dark ? ink : gold;
    return SizedBox(
      width: double.infinity,
      height: height,
      child: ElevatedButton(
        onPressed: busy ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledBackgroundColor: bg.withValues(alpha: 0.6),
          disabledForegroundColor: fg,
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (busy)
            SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
          else if (icon != null)
            Icon(icon, size: fontSize + 4, color: fg),
          if (busy || icon != null) const SizedBox(width: 8),
          Flexible(child: T(label, size: fontSize, weight: FontWeight.w800, color: fg, align: TextAlign.center)),
        ]),
      ),
    );
  }
}

class OutlineBtn extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool danger;
  final double height;
  const OutlineBtn(this.label, {super.key, this.icon, this.onTap, this.danger = false, this.height = 48});
  @override
  Widget build(BuildContext context) {
    final fg = danger ? redText : ink;
    return SizedBox(
      width: double.infinity,
      height: height,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: fg,
          backgroundColor: danger ? redBg : Colors.white,
          side: BorderSide(color: danger ? redLine : line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (icon != null) ...[Icon(icon, size: 16, color: fg), const SizedBox(width: 8)],
          Flexible(child: T(label, weight: FontWeight.w700, color: fg, align: TextAlign.center)),
        ]),
      ),
    );
  }
}

class ErrorBox extends StatelessWidget {
  final String? text;
  const ErrorBox(this.text, {super.key});
  @override
  Widget build(BuildContext context) {
    if (text == null) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: cardBox(color: redBg, border: redLine, radius: 10),
      child: T(text!, color: redText),
    );
  }
}

class KV extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const KV(this.label, this.value, {super.key, this.bold = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Flexible(child: T(label, color: n500)),
          const SizedBox(width: 12),
          Flexible(child: T(value, weight: bold ? FontWeight.w700 : FontWeight.w500, align: TextAlign.right)),
        ]),
      );
}

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});
  static const _map = <String, List<dynamic>>{
    'COMPLETED': ['Bajarildi', green, greenBg, greenLine],
    'CANCELLED': ['Bekor', redText, redBg, redLine],
    'REJECTED': ['Bekor', redText, redBg, redLine],
    'IN_PROGRESS': ['Yo‘lda', goldDeep, Color(0x1A3B9BFF), Color(0x663B9BFF)],
    'ON_THE_WAY': ['Yo‘lda', goldDeep, Color(0x1A3B9BFF), Color(0x663B9BFF)],
    'PICKED_UP': ['Yo‘lda', goldDeep, Color(0x1A3B9BFF), Color(0x663B9BFF)],
    'ARRIVED': ['Yetib keldi', goldDeep, Color(0x1A3B9BFF), Color(0x663B9BFF)],
    'COOKING': ['Tayyorlanmoqda', goldDeep, Color(0x1A3B9BFF), Color(0x663B9BFF)],
    'PENDING': ['Yangi', goldDeep, Color(0x1A3B9BFF), Color(0x803B9BFF)],
    'ACCEPTED': ['Qabul', Color(0xFF1D4ED8), Color(0xFFEFF6FF), Color(0xFFBFDBFE)],
    'READY': ['Tayyor', Color(0xFF1D4ED8), Color(0xFFEFF6FF), Color(0xFFBFDBFE)],
    'DELIVERED': ['Yetkazildi', green, greenBg, greenLine],
  };
  @override
  Widget build(BuildContext context) {
    final c = _map[status] ?? [status, n600, const Color(0xFFF5F5F5), line];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c[2] as Color, borderRadius: BorderRadius.circular(99), border: Border.all(color: c[3] as Color)),
      child: T(tr(c[0] as String).toUpperCase(), size: 10, weight: FontWeight.w700, color: c[1] as Color),
    );
  }
}

/// Lotin | Кирилл switch; its own labels are never converted.
class LangToggle extends StatelessWidget {
  final bool dark;
  const LangToggle({super.key, this.dark = false});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: lang,
        builder: (_, __) {
          Widget btn(bool cyr, String label) {
            final on = lang.cyrillic == cyr;
            return GestureDetector(
              onTap: () => lang.set(cyr),
              child: Container(
                height: 32,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(color: on ? gold : Colors.transparent, borderRadius: BorderRadius.circular(8)),
                child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: on ? ink : (dark ? n300 : n600))),
              ),
            );
          }

          return Container(
            padding: const EdgeInsets.all(4),
            decoration: cardBox(color: dark ? Colors.transparent : Colors.white, border: dark ? n600 : line, radius: 12),
            child: Row(mainAxisSize: MainAxisSize.min, children: [btn(false, 'Lotin'), const SizedBox(width: 4), btn(true, 'Кирилл')]),
          );
        },
      );
}

/// A big sum that shrinks to fit its place instead of being cut off
/// ("1 250 000 so‘m" in a small card on a narrow phone).
class Fit extends StatelessWidget {
  final Widget child;
  final AlignmentGeometry alignment;
  const Fit(this.child, {super.key, this.alignment = AlignmentDirectional.centerStart});
  @override
  Widget build(BuildContext context) => FittedBox(fit: BoxFit.scaleDown, alignment: alignment, child: child);
}

/// A sum with "so‘m" after it, on one line, shrinking to fit.
class SumLine extends StatelessWidget {
  final String value;
  final double size;
  final Color? color;
  final String unit;
  final double unitSize;
  final Color unitColor;
  final AlignmentGeometry alignment;
  const SumLine(this.value,
      {super.key,
      required this.size,
      this.color,
      this.unit = 'so‘m',
      this.unitSize = 14,
      this.unitColor = n400,
      this.alignment = AlignmentDirectional.centerStart});
  @override
  Widget build(BuildContext context) => Fit(
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            T(value, size: size, weight: FontWeight.w800, color: color),
            if (unit.isNotEmpty) ...[
              SizedBox(width: size / 5),
              T(unit, size: unitSize, color: unitColor),
            ],
          ],
        ),
        alignment: alignment,
      );
}

/// Off in widget tests (no tile server there).
bool mapsEnabled = true;

/// Map preview: a real tile map (never reloads as a page, so no dark flashes).
class MiniMap extends StatelessWidget {
  final double lat;
  final double lng;
  final double aspect;
  final List<Pt>? route;
  final Pt? me;
  const MiniMap({super.key, required this.lat, required this.lng, this.aspect = 16 / 10, this.route, this.me});
  @override
  Widget build(BuildContext context) {
    if (!mapsEnabled) return AspectRatio(aspectRatio: aspect, child: const ColoredBox(color: Color(0xFFF2EFE9)));
    final line = route == null ? null : [for (final p in route!) LatLng(p.lat, p.lng)];
    return AspectRatio(
      aspectRatio: aspect,
      child: FlutterMap(
        // A new route frames the whole way again; after that the driver may pan freely.
        key: ValueKey('$lat,$lng,${identityHashCode(route)}'),
        options: MapOptions(
          initialCenter: LatLng(lat, lng),
          initialZoom: 15,
          initialCameraFit: line != null && line.length > 1
              ? CameraFit.coordinates(coordinates: line, padding: const EdgeInsets.all(28), maxZoom: 16)
              : null,
          backgroundColor: const Color(0xFFF2EFE9),
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'uz.moviytaxi.driver',
          ),
          if (line != null && line.length > 1)
            PolylineLayer(polylines: [Polyline(points: line, strokeWidth: 5, color: gold)]),
          MarkerLayer(markers: [
            Marker(
              point: LatLng(lat, lng),
              width: 36,
              height: 36,
              alignment: Alignment.topCenter,
              child: const Icon(Icons.location_on, size: 36, color: goldDark),
            ),
            if (me != null)
              Marker(
                point: LatLng(me!.lat, me!.lng),
                width: 20,
                height: 20,
                child: Container(
                  decoration: BoxDecoration(color: ink, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                ),
              ),
          ]),
          const SimpleAttributionWidget(source: Text('OpenStreetMap', style: TextStyle(fontSize: 10))),
        ],
      ),
    );
  }
}

const _navIcons = {
  'left': Icons.turn_left,
  'right': Icons.turn_right,
  'slight_left': Icons.turn_slight_left,
  'slight_right': Icons.turn_slight_right,
  'sharp_left': Icons.turn_sharp_left,
  'sharp_right': Icons.turn_sharp_right,
  'uturn': Icons.u_turn_left,
  'straight': Icons.straight,
  'keep_left': Icons.fork_left,
  'keep_right': Icons.fork_right,
  'roundabout': Icons.roundabout_right,
  'arrive': Icons.flag,
};

const _navWaiting = {
  'waiting-gps': 'GPS kutilmoqda…',
  'routing': 'Yo‘l hisoblanmoqda…',
  'failed': 'Yo‘lni hisoblab bo‘lmadi. Yandex tugmasidan foydalaning.',
};

/// The next turn: what to do, in how many metres, with the voice on/off switch.
class NavCard extends StatelessWidget {
  final VoiceNav nav;
  const NavCard(this.nav, {super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: nav,
        builder: (context, _) {
          if (nav.state == 'off') return const SizedBox.shrink();
          final u = nav.last;
          final m = nav.state == 'ok' ? u?.next : null;
          final street = m?.street.trim() ?? '';
          final minutes = u == null ? 1 : (u.remainSec / 60).round().clamp(1, 999);
          return Section(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(color: ink, border: ink),
              child: Row(children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: gold, borderRadius: BorderRadius.circular(12)),
                  child: Icon(m == null ? Icons.navigation_rounded : (_navIcons[m.icon] ?? Icons.straight), size: 28, color: ink),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: m == null
                      ? T(_navWaiting[nav.state] ?? '', color: n300)
                      : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          T(fmtDist(u!.distM), size: 20, weight: FontWeight.w800, color: Colors.white),
                          T(m.text, weight: FontWeight.w600, color: Colors.white),
                          T('${fmtDist(u.remainM)} · ~$minutes daq${street.isEmpty ? '' : ' · $street'}', size: 12, color: n400, maxLines: 1),
                        ]),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: nav.toggleMute,
                  tooltip: nav.muted ? 'Ovozni yoqish' : 'Ovozni o‘chirish',
                  icon: Icon(nav.muted ? Icons.volume_off : Icons.volume_up, color: nav.muted ? n500 : gold),
                ),
              ]),
            ),
          );
        },
      );
}

/// "Yo‘l ko‘rsatish": Yandex Navigator, or Yandex Maps when it isn't installed.
Future<void> openNavigator(double lat, double lng) async {
  final deep = Uri.parse('yandexnavi://build_route_on_map?lat_to=$lat&lon_to=$lng');
  try {
    if (await launchUrl(deep, mode: LaunchMode.externalNonBrowserApplication)) return;
  } catch (_) {}
  await launchUrl(Uri.parse('https://yandex.uz/maps/?rtext=~$lat,$lng&rtt=auto'), mode: LaunchMode.externalApplication);
}

Future<void> callPhone(String? phone) async {
  if (phone == null || phone.isEmpty) return;
  await launchUrl(Uri.parse('tel:$phone'));
}

class NavButton extends StatelessWidget {
  final String label;
  final double lat;
  final double lng;
  final bool secondary;
  const NavButton({super.key, required this.label, required this.lat, required this.lng, this.secondary = false});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 44,
        child: TextButton(
          onPressed: () => openNavigator(lat, lng),
          style: TextButton.styleFrom(
            backgroundColor: secondary ? Colors.white : ink,
            foregroundColor: secondary ? ink : gold,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: secondary ? const BorderSide(color: line) : BorderSide.none),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.navigation_rounded, size: 16, color: secondary ? ink : gold),
            const SizedBox(width: 8),
            Flexible(child: T(label, weight: FontWeight.w700, color: secondary ? ink : gold)),
          ]),
        ),
      );
}

class PhoneButton extends StatelessWidget {
  final String? phone;
  const PhoneButton(this.phone, {super.key});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 44,
        height: 44,
        child: FloatingActionButton(
          heroTag: null,
          elevation: 2,
          backgroundColor: gold,
          foregroundColor: ink,
          shape: const CircleBorder(),
          onPressed: () => callPhone(phone),
          child: const Icon(Icons.phone, size: 18),
        ),
      );
}

Future<bool> confirmDialog(BuildContext context, String text) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      content: T(text, size: 15),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: T('Yo‘q', color: n600, weight: FontWeight.w600)),
        TextButton(onPressed: () => Navigator.pop(c, true), child: T('Ha', color: goldDark, weight: FontWeight.w800)),
      ],
    ),
  );
  return r == true;
}

void toast(BuildContext context, String text) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(text))));
}

/// Step dots in the hero of an active job.
class StepProgress extends StatelessWidget {
  final List<String> labels;
  final int current;
  const StepProgress({super.key, required this.labels, required this.current});
  @override
  Widget build(BuildContext context) {
    final bar = Positioned.fill(
      top: 17,
      bottom: null,
      child: LayoutBuilder(builder: (_, c) {
        final inset = c.maxWidth / labels.length / 2;
        final full = c.maxWidth - inset * 2;
        final done = labels.length > 1 ? full * (current < 0 ? 0 : current) / (labels.length - 1) : 0.0;
        return SizedBox(
          height: 3,
          child: Stack(children: [
            Positioned(left: inset, right: inset, top: 0, height: 3, child: Container(color: const Color(0xFF262626))),
            Positioned(left: inset, width: done, top: 0, height: 3, child: Container(color: gold)),
          ]),
        );
      }),
    );
    return Stack(children: [
      bar,
      Row(children: [
        for (var i = 0; i < labels.length; i++)
          Expanded(
            child: Column(children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i <= current ? gold : const Color(0xFF171717),
                  border: Border.all(color: i <= current ? gold : const Color(0xFF404040), width: 2),
                ),
                child: i < current
                    ? const Icon(Icons.check, size: 18, color: ink)
                    : Text('${i + 1}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: i == current ? ink : n500)),
              ),
              const SizedBox(height: 8),
              T(tr(labels[i]).toUpperCase(),
                  size: 11,
                  weight: FontWeight.w700,
                  align: TextAlign.center,
                  color: i == current ? gold : (i < current ? const Color(0xFFE5E5E5) : n500)),
            ]),
          ),
      ]),
    ]);
  }
}

String money(dynamic v) => '${fmtSum(v)} so‘m';
