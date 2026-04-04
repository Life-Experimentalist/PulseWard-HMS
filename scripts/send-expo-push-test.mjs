function parseArgs(argv) {
  const result = {
    token: "",
    title: "PulseWard CLI Push",
    body: "This push was sent from PulseWard terminal tool.",
    data: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--token") {
      result.token = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (arg === "--title") {
      result.title = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (arg === "--body") {
      result.body = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (arg === "--data") {
      const raw = String(argv[index + 1] || "").trim();
      if (raw) {
        result.data = JSON.parse(raw);
      }
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function printHelp() {
  console.log("Send a test Expo push notification from terminal.");
  console.log("");
  console.log("Usage:");
  console.log(
    '  pnpm run push:expo:test -- --token ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] --title "Hello" --body "World"'
  );
  console.log("");
  console.log("Optional:");
  console.log('  --data \'{"tenantKey":"citycare-hospital"}\'');
}

function isExpoPushToken(value) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!isExpoPushToken(options.token)) {
    throw new Error("A valid Expo push token is required via --token.");
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: options.token,
      title: options.title,
      body: options.body,
      sound: "default",
      data: options.data,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
