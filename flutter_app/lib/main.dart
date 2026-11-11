import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

void main() => runApp(const TravelMapApp());

class TravelMapApp extends StatelessWidget {
  const TravelMapApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TPVA Travel Map',
      theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
      home: const TravelMapPage(),
    );
  }
}

class TravelMapPage extends StatelessWidget {
  const TravelMapPage({super.key});

  static const _initialCenter = LatLng(16.0471, 108.2068); // Da Nang

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('TPVA · Bản đồ du lịch')),
      body: FlutterMap(
        options: const MapOptions(
          initialCenter: _initialCenter,
          initialZoom: 12,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.tpva.travel_map',
          ),
          const RichAttributionWidget(
            attributions: [
              TextSourceAttribution('OpenStreetMap contributors'),
            ],
          ),
        ],
      ),
    );
  }
}
