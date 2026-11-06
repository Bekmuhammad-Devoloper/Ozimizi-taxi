import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/lang.dart';
import 'core/live.dart';
import 'core/store.dart';
import 'screens/auth.dart';
import 'screens/balance.dart';
import 'screens/dashboard.dart';
import 'screens/delivery.dart';
import 'screens/order_active.dart';
import 'screens/order_detail.dart';
import 'screens/orders.dart';
import 'screens/permissions.dart';
import 'screens/profile.dart';
import 'screens/taximeter.dart';
import 'ui/kit.dart';
import 'ui/overlays.dart';

final navKey = GlobalKey<NavigatorState>();

/// Open a screen from anywhere (socket events, the service).
void goTo(String route, {Object? args}) {
  navKey.currentState?.pushNamed(route, arguments: args);
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await lang.load();
  await auth.load();
  await orders.load();
  await deliveries.load();
  runApp(const MoviyApp());
}

Widget appProviders(Widget child) => MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: lang),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: orders),
        ChangeNotifierProvider.value(value: deliveries),
        ChangeNotifierProvider.value(value: bus),
      ],
      child: child,
    );

Route<dynamic> appRoute(RouteSettings s) => MaterialPageRoute(settings: s, builder: (_) => _screen(s));

Widget _screen(RouteSettings s) {
  switch (s.name) {
    case '/register':
      return const RegisterScreen();
    case '/forgot':
      return const ForgotScreen();
    case '/reset':
      return ResetScreen(phone: s.arguments as String?);
    case '/orders':
      return const OrdersScreen();
    case '/order/active':
      return const ActiveOrderScreen();
    case '/order/detail':
      return OrderDetailScreen(id: s.arguments as String);
    case '/taximeter':
      return const TaximeterScreen();
    case '/delivery/active':
      return const ActiveDeliveryScreen();
    case '/balance':
      return const BalanceScreen();
    case '/profile':
      return const ProfileScreen();
    case '/permissions':
      return PermissionScreen(onDone: () => navKey.currentState?.maybePop());
    default:
      return const RootGate();
  }
}

class MoviyApp extends StatelessWidget {
  const MoviyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return appProviders(
      Consumer<Lang>(
        builder: (_, __, ___) => MaterialApp(
          title: 'Moviy Taxi',
          debugShowCheckedModeBanner: false,
          navigatorKey: navKey,
          theme: appTheme(),
          home: const RootGate(),
          builder: (c, child) => AppOverlays(child: child ?? const SizedBox.shrink()),
          onGenerateRoute: appRoute,
        ),
      ),
    );
  }
}

/// Permissions first; then login, the wait-for-approval screen, or the app.
class RootGate extends StatefulWidget {
  const RootGate({super.key});
  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  bool? _needPerms;

  @override
  void initState() {
    super.initState();
    needsPermissionScreen().then((v) {
      if (mounted) setState(() => _needPerms = v);
    });
    live.start();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthStore>();
    if (_needPerms == null) return const Scaffold(backgroundColor: paper);
    if (_needPerms!) return PermissionScreen(onDone: () => setState(() => _needPerms = false));
    if (auth.token == null) return const LoginScreen();
    if (auth.driver?['isApproved'] == false) return const PendingScreen();
    return const DashboardScreen();
  }
}
