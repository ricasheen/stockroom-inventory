import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

void main() => runApp(const StockroomApp());

class StockroomApp extends StatelessWidget {
  const StockroomApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Stockroom',
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff287a46)), useMaterial3: true),
        home: const InventoryScreen(),
      );
}

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});
  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  static const api = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8000/api');
  final email = TextEditingController();
  final password = TextEditingController();
  String? token;
  String error = '';
  List<dynamic> products = [];
  bool loading = false;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((prefs) {
      token = prefs.getString('stockroom_token');
      if (mounted) setState(() {});
      loadProducts();
    });
  }

  Future<void> login() async {
    setState(() { loading = true; error = ''; });
    try {
      final response = await http.post(Uri.parse('$api/login'), headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: jsonEncode({'email': email.text.trim(), 'password': password.text}));
      final data = jsonDecode(response.body);
      if (response.statusCode != 200) throw Exception(data['message'] ?? 'Sign in failed.');
      token = data['token'] as String;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('stockroom_token', token!);
      await loadProducts();
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> loadProducts() async {
    if (token == null) return;
    try {
      final response = await http.get(Uri.parse('$api/products'), headers: {'Authorization': 'Bearer $token', 'Accept': 'application/json'});
      if (response.statusCode == 401) { await signOut(); return; }
      if (response.statusCode != 200) throw Exception('Could not load inventory.');
      if (mounted) setState(() => products = jsonDecode(response.body) as List<dynamic>);
    } catch (e) { if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', '')); }
  }

  Future<void> signOut() async {
    final oldToken = token;
    token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('stockroom_token');
    if (oldToken != null) {
      await http.post(Uri.parse('$api/logout'), headers: {'Authorization': 'Bearer $oldToken', 'Accept': 'application/json'});
    }
    if (mounted) setState(() => products = []);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Stockroom'), actions: [if (token != null) IconButton(onPressed: loadProducts, icon: const Icon(Icons.refresh)), if (token != null) IconButton(onPressed: signOut, icon: const Icon(Icons.logout))]),
        body: token == null
            ? Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 400), child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.inventory_2_outlined, size: 48), const SizedBox(height: 16), TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')), TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')), if (error.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(error, style: const TextStyle(color: Colors.red))), const SizedBox(height: 16), FilledButton(onPressed: loading ? null : login, child: Text(loading ? 'Signing in…' : 'Sign in'))]))))
            : RefreshIndicator(onRefresh: loadProducts, child: ListView(children: [Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 8), child: Text('${products.length} products', style: Theme.of(context).textTheme.titleLarge)), ...products.map((p) => ListTile(leading: const CircleAvatar(child: Icon(Icons.inventory_2_outlined)), title: Text(p['name'] as String), subtitle: Text('${p['sku']} · ${p['category']}'), trailing: Text('${p['quantity']} in stock')))])),
      );
}
