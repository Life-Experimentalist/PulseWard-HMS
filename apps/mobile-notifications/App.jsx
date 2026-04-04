const React = require("react");
const {
  ActivityIndicator,
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = require("react-native");
const Constants = require("expo-constants");
const Device = require("expo-device");
const Notifications = require("expo-notifications");

const { useCallback, useEffect, useMemo, useRef, useState } = React;

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5102";
const DEFAULT_AUTH_BASE_URL = "http://127.0.0.1:5101";
const DEFAULT_TEST_PUSH_TITLE = "PulseWard Test Push";
const DEFAULT_TEST_PUSH_BODY = "Your Android phone is connected to PulseWard push.";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getApiBaseUrl() {
  return (
    process.env.EXPO_PUBLIC_PULSEWARD_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL
  );
}

function getAuthBaseUrl() {
  return process.env.EXPO_PUBLIC_PULSEWARD_AUTH_BASE_URL || DEFAULT_AUTH_BASE_URL;
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

function resolveProjectId() {
  var explicitProjectId = String(process.env.EXPO_PUBLIC_EXPO_PROJECT_ID || "").trim();
  if (explicitProjectId) {
    return explicitProjectId;
  }

  var easProjectId =
    (Constants &&
      Constants.expoConfig &&
      Constants.expoConfig.extra &&
      Constants.expoConfig.extra.eas &&
      Constants.expoConfig.extra.eas.projectId) ||
    (Constants && Constants.easConfig && Constants.easConfig.projectId) ||
    "";

  return String(easProjectId || "").trim();
}

function isExpoPushToken(value) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value);
}

function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const authBaseUrl = useMemo(getAuthBaseUrl, []);
  const [tenantKey, setTenantKey] = useState("citycare-hospital");
  const [projectId, setProjectId] = useState(resolveProjectId);
  const [email, setEmail] = useState("patient@citycare.example.com");
  const [password, setPassword] = useState("demo-password");
  const [role, setRole] = useState("patient");
  const [authToken, setAuthToken] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pushToken, setPushToken] = useState("");
  const [pushTitle, setPushTitle] = useState(DEFAULT_TEST_PUSH_TITLE);
  const [pushBody, setPushBody] = useState(DEFAULT_TEST_PUSH_BODY);
  const [pushStatus, setPushStatus] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);
  const receivedListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(function setupNotificationListeners() {
    receivedListener.current = Notifications.addNotificationReceivedListener(function (event) {
      setLastNotification(event);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(function (
      response
    ) {
      var notification = response && response.notification ? response.notification : null;
      if (notification) {
        setLastNotification(notification);
      }
    });

    return function cleanupNotificationListeners() {
      if (receivedListener.current) {
        receivedListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const login = useCallback(
    async function login() {
      var nextTenant = String(tenantKey || "").trim();
      var nextEmail = String(email || "").trim();
      var nextPassword = String(password || "").trim();
      var nextRole = String(role || "")
        .trim()
        .toLowerCase();

      if (!nextTenant || !nextEmail || !nextPassword || !nextRole) {
        setAuthStatus("Tenant, email, password, and role are required.");
        return;
      }

      setAuthBusy(true);
      setAuthStatus("");

      try {
        var response = await fetch(authBaseUrl + "/api/v1/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantKey: nextTenant,
            email: nextEmail,
            password: nextPassword,
            role: nextRole,
          }),
        });

        var payload = await response.json().catch(function () {
          return null;
        });

        if (!response.ok || !payload || !payload.token) {
          throw new Error(
            (payload && payload.message) ||
              "Login failed. Check auth-service, tenant, role, and credentials."
          );
        }

        setAuthToken(payload.token);
        setAuthStatus("Login successful. Notifications are now user-scoped.");
      } catch (loginError) {
        setAuthToken("");
        setAuthStatus(
          loginError && loginError.message
            ? loginError.message
            : "Login failed due to a network or server error."
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [authBaseUrl, email, password, role, tenantKey]
  );

  const registerUser = useCallback(
    async function registerUser() {
      var nextTenant = String(tenantKey || "").trim();
      var nextEmail = String(email || "").trim();
      var nextPassword = String(password || "").trim();
      var nextRole = String(role || "")
        .trim()
        .toLowerCase();

      if (!nextTenant || !nextEmail || !nextPassword || !nextRole) {
        setAuthStatus("Tenant, email, password, and role are required.");
        return;
      }

      setAuthBusy(true);
      setAuthStatus("");

      try {
        var response = await fetch(authBaseUrl + "/api/v1/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantKey: nextTenant,
            email: nextEmail,
            password: nextPassword,
            role: nextRole,
          }),
        });

        var payload = await response.json().catch(function () {
          return null;
        });

        if (response.status === 201) {
          setAuthStatus("User registered. You can now login.");
          return;
        }

        if (response.status === 409) {
          setAuthStatus("User already exists. Login directly.");
          return;
        }

        throw new Error((payload && payload.message) || "User registration failed.");
      } catch (registerError) {
        setAuthStatus(
          registerError && registerError.message
            ? registerError.message
            : "Registration failed due to a network or server error."
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [authBaseUrl, email, password, role, tenantKey]
  );

  const registerForPushNotifications = useCallback(
    async function registerPush() {
      setPushBusy(true);
      setPushStatus("");

      try {
        if (!authToken) {
          throw new Error("Login first. Push registration is now protected by auth.");
        }

        if (!Device.isDevice) {
          throw new Error("Push requires a physical Android phone. Emulators are not supported.");
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#0d6b52",
          });
        }

        var existingPermission = await Notifications.getPermissionsAsync();
        var permissionStatus = existingPermission.status;

        if (permissionStatus !== "granted") {
          var requestedPermission = await Notifications.requestPermissionsAsync();
          permissionStatus = requestedPermission.status;
        }

        if (permissionStatus !== "granted") {
          throw new Error("Notification permission was denied on this device.");
        }

        var candidateProjectId = String(projectId || "").trim();
        var tokenResponse;
        if (candidateProjectId) {
          tokenResponse = await Notifications.getExpoPushTokenAsync({
            projectId: candidateProjectId,
          });
        } else {
          tokenResponse = await Notifications.getExpoPushTokenAsync();
        }

        var token = tokenResponse && tokenResponse.data ? tokenResponse.data : "";
        if (!isExpoPushToken(token)) {
          throw new Error("Received an invalid Expo push token.");
        }

        var registrationResponse = await fetch(
          apiBaseUrl + "/api/v1/integrations/mobile/push/register",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + authToken,
            },
            body: JSON.stringify({
              tenantKey: String(tenantKey || "").trim(),
              expoPushToken: token,
              platform: Platform.OS,
            }),
          }
        );

        var registrationPayload = await registrationResponse.json().catch(function () {
          return null;
        });

        if (!registrationResponse.ok) {
          throw new Error(
            (registrationPayload && registrationPayload.message) ||
              "Backend push registration failed"
          );
        }

        setPushToken(token);
        setPushStatus(
          "Push token registered for your authenticated user. You can send a test push."
        );
      } catch (pushError) {
        setPushToken("");
        setPushStatus(pushError && pushError.message ? pushError.message : "Push setup failed.");
      } finally {
        setPushBusy(false);
      }
    },
    [apiBaseUrl, authToken, projectId, tenantKey]
  );

  const sendTestPush = useCallback(
    async function sendTestPush() {
      if (!authToken) {
        setPushStatus("Login first before sending push notifications.");
        return;
      }

      if (!isExpoPushToken(pushToken)) {
        setPushStatus("Get and register a valid Expo push token first.");
        return;
      }

      setPushBusy(true);
      setPushStatus("");

      try {
        var response = await fetch(apiBaseUrl + "/api/v1/integrations/mobile/push/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + authToken,
          },
          body: JSON.stringify({
            tenantKey: String(tenantKey || "").trim(),
            title: pushTitle || DEFAULT_TEST_PUSH_TITLE,
            body: pushBody || DEFAULT_TEST_PUSH_BODY,
          }),
        });

        var payload = await response.json().catch(function () {
          return null;
        });
        if (!response.ok) {
          throw new Error(
            (payload && (payload.message || payload.detail)) || "Push request failed"
          );
        }

        var ticket = payload && payload.ticket ? payload.ticket : null;
        var ticketStatus = ticket && ticket.status ? ticket.status : "unknown";
        setPushStatus("Push request accepted by backend. Ticket status: " + ticketStatus);
      } catch (pushError) {
        setPushStatus(pushError && pushError.message ? pushError.message : "Push send failed.");
      } finally {
        setPushBusy(false);
      }
    },
    [apiBaseUrl, authToken, pushBody, pushTitle, pushToken, tenantKey]
  );

  const loadEvents = useCallback(async () => {
    const nextTenant = tenantKey.trim();
    if (!nextTenant) {
      setError("Tenant key is required.");
      return;
    }

    if (!authToken) {
      setError("Login first to load tenant-scoped events.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ tenantKey: nextTenant });
      const response = await fetch(
        `${apiBaseUrl}/api/v1/integrations/appointments/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
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
  }, [apiBaseUrl, authToken, tenantKey]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>PulseWard Notifications</Text>
        <Text style={styles.subtitle}>Tenant-scoped appointment event inbox</Text>
      </View>

      <View style={styles.controls}>
        <Text style={styles.title2}>User Login (Required)</Text>
        <Text style={styles.label}>Auth base</Text>
        <Text style={styles.meta}>{authBaseUrl}</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="patient@citycare.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="demo-password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />

        <Text style={styles.label}>Role</Text>
        <TextInput
          value={role}
          onChangeText={setRole}
          placeholder="patient"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={login}
          style={styles.button}
          disabled={authBusy}
        >
          <Text style={styles.buttonText}>{authBusy ? "Signing in..." : "Login"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={registerUser}
          style={styles.buttonSecondary}
          disabled={authBusy}
        >
          <Text style={styles.buttonSecondaryText}>
            {authBusy ? "Working..." : "Register user (first time)"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.meta}>{authStatus || "Login required for events and push flows."}</Text>
        {authToken ? (
          <Text style={styles.tokenPreview}>Token: {authToken.slice(0, 24)}...</Text>
        ) : null}
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

      <View style={styles.controls}>
        <Text style={styles.title2}>Android Push Setup</Text>
        <Text style={styles.label}>Expo project id (optional if auto-detected)</Text>
        <TextInput
          value={projectId}
          onChangeText={setProjectId}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={registerForPushNotifications}
          style={styles.button}
          disabled={pushBusy}
        >
          <Text style={styles.buttonText}>
            {pushBusy ? "Working..." : "Enable push and get token"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Expo push token</Text>
        <Text selectable style={styles.tokenText}>
          {pushToken || "No token yet"}
        </Text>

        <Text style={styles.label}>Test push title</Text>
        <TextInput
          value={pushTitle}
          onChangeText={setPushTitle}
          placeholder={DEFAULT_TEST_PUSH_TITLE}
          style={styles.input}
        />

        <Text style={styles.label}>Test push body</Text>
        <TextInput
          value={pushBody}
          onChangeText={setPushBody}
          placeholder={DEFAULT_TEST_PUSH_BODY}
          style={styles.input}
        />

        <TouchableOpacity
          accessibilityRole="button"
          onPress={sendTestPush}
          style={styles.button}
          disabled={pushBusy}
        >
          <Text style={styles.buttonText}>{pushBusy ? "Sending..." : "Send test push"}</Text>
        </TouchableOpacity>

        <Text style={styles.meta}>{pushStatus || "Register token and send a test push."}</Text>

        {lastNotification ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last notification received</Text>
            <Text style={styles.cardLine}>
              Title:{" "}
              {lastNotification.request && lastNotification.request.content
                ? lastNotification.request.content.title || "n/a"
                : "n/a"}
            </Text>
            <Text style={styles.cardLine}>
              Body:{" "}
              {lastNotification.request && lastNotification.request.content
                ? lastNotification.request.content.body || "n/a"
                : "n/a"}
            </Text>
          </View>
        ) : null}
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
  title2: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17324a",
    marginBottom: 8,
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
  buttonSecondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#0d6b52",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  buttonSecondaryText: {
    color: "#0d6b52",
    fontWeight: "600",
    fontSize: 15,
  },
  meta: {
    marginTop: 8,
    color: "#587083",
    fontSize: 12,
  },
  tokenText: {
    borderWidth: 1,
    borderColor: "#c3d1dc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#17324a",
    fontSize: 12,
  },
  tokenPreview: {
    marginTop: 6,
    color: "#445a6b",
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
