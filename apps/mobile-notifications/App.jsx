const React = require("react");
const {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = require("react-native");

const { useCallback, useMemo, useState } = React;

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5102";

function getApiBaseUrl() {
  return (
    process.env.EXPO_PUBLIC_PULSEWARD_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL
  );
}

function formatTimestamp(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const [tenantKey, setTenantKey] = useState("citycare-hospital");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    const nextTenant = tenantKey.trim();
    if (!nextTenant) {
      setError("Tenant key is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ tenantKey: nextTenant });
      const response = await fetch(
        `${apiBaseUrl}/api/v1/integrations/appointments/events?${params.toString()}`
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load notification events.");
      }

      const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
      setEvents(receipts);
    } catch (requestError) {
      setEvents([]);
      setError(requestError?.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, tenantKey]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>PulseWard Notifications</Text>
        <Text style={styles.subtitle}>Tenant-scoped appointment event inbox</Text>
      </View>

      <View style={styles.controls}>
        <Text style={styles.label}>Tenant key</Text>
        <TextInput
          value={tenantKey}
          onChangeText={setTenantKey}
          placeholder="citycare-hospital"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={loadEvents}
          style={styles.button}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Loading..." : "Fetch events"}</Text>
        </TouchableOpacity>
        <Text style={styles.meta}>API base: {apiBaseUrl}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color="#0d6b52" />
          <Text style={styles.loadingText}>Loading appointment events...</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={events}
        keyExtractor={(item, index) => item.id || item.correlationId || String(index)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No events loaded yet. Fetch events for a tenant.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.eventType || "appointment.event"}</Text>
            <Text style={styles.cardLine}>Appointment: {item.appointmentId || "n/a"}</Text>
            <Text style={styles.cardLine}>Patient: {item.patientId || "n/a"}</Text>
            <Text style={styles.cardLine}>Correlation: {item.correlationId || "n/a"}</Text>
            <Text style={styles.cardLine}>Recorded: {formatTimestamp(item.recordedAt)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f6f8",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#17324a",
  },
  subtitle: {
    marginTop: 4,
    color: "#43576a",
    fontSize: 14,
  },
  controls: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: "#34495b",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#c3d1dc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#17324a",
  },
  button: {
    marginTop: 10,
    backgroundColor: "#0d6b52",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  meta: {
    marginTop: 8,
    color: "#587083",
    fontSize: 12,
  },
  loadingBlock: {
    alignItems: "center",
    marginVertical: 12,
  },
  loadingText: {
    marginTop: 8,
    color: "#445a6b",
  },
  error: {
    color: "#b13535",
    marginBottom: 10,
  },
  list: {
    paddingBottom: 20,
  },
  empty: {
    color: "#5a7081",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#d8e1e8",
  },
  cardTitle: {
    color: "#17324a",
    fontWeight: "700",
    marginBottom: 6,
  },
  cardLine: {
    color: "#4a6173",
    marginBottom: 3,
    fontSize: 13,
  },
});

module.exports = App;
