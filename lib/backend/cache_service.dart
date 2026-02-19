import 'dart:async';

class CacheEntry<T> {
  final T data;
  final DateTime createdAt;
  final Duration ttl;

  CacheEntry({
    required this.data,
    required this.ttl,
  }) : createdAt = DateTime.now();

  bool get isExpired => DateTime.now().difference(createdAt) > ttl;
}

class CacheService {
  CacheService._internal();
  static final CacheService _instance = CacheService._internal();
  static CacheService get instance => _instance;

  final Map<String, CacheEntry<dynamic>> _cache = {};
  final Map<String, Completer<dynamic>> _pendingRequests = {};

  static const Duration defaultTTL = Duration(minutes: 5);
  static const Duration shortTTL = Duration(minutes: 2);
  static const Duration longTTL = Duration(minutes: 15);

  Future<T> getOrFetch<T>({
    required String key,
    required Future<T> Function() fetcher,
    Duration? ttl,
  }) async {
    final entry = _cache[key];
    if (entry != null && !entry.isExpired && entry.data is T) {
      return entry.data as T;
    }

    if (_pendingRequests.containsKey(key)) {
      return await _pendingRequests[key]!.future as T;
    }

    final completer = Completer<T>();
    _pendingRequests[key] = completer;

    try {
      final data = await fetcher();
      set<T>(key: key, data: data, ttl: ttl ?? defaultTTL);
      completer.complete(data);
      return data;
    } catch (e) {
      completer.completeError(e);
      rethrow;
    } finally {
      _pendingRequests.remove(key);
    }
  }

  T? get<T>(String key) {
    final entry = _cache[key];
    if (entry != null && !entry.isExpired && entry.data is T) {
      return entry.data as T;
    }
    if (entry != null && entry.isExpired) {
      _cache.remove(key);
    }
    return null;
  }

  void set<T>({
    required String key,
    required T data,
    Duration? ttl,
  }) {
    _cache[key] = CacheEntry<T>(
      data: data,
      ttl: ttl ?? defaultTTL,
    );
  }

  void invalidate(String key) {
    _cache.remove(key);
  }

  void invalidatePattern(String pattern) {
    final keysToRemove = _cache.keys
        .where((key) => key.contains(pattern))
        .toList();
    for (final key in keysToRemove) {
      _cache.remove(key);
    }
  }

  void invalidateAll() {
    _cache.clear();
  }

  void clearExpired() {
    final keysToRemove = _cache.entries
        .where((entry) => entry.value.isExpired)
        .map((entry) => entry.key)
        .toList();
    for (final key in keysToRemove) {
      _cache.remove(key);
    }
  }

  int get size => _cache.length;

  bool has(String key) {
    final entry = _cache[key];
    return entry != null && !entry.isExpired;
  }
}

final cacheService = CacheService.instance;
