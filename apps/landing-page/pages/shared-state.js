(function () {
  var raw = localStorage.getItem("pulseward.demo.state.v2");
  if (!raw) {
    return;
  }

  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return;
  }

  if (!parsed) {
    return;
  }

  var providers = [];
  if (parsed.modules && parsed.modules.messaging) {
    if (parsed.modules.messaging.telegram) providers.push("Telegram");
    if (parsed.modules.messaging.email) providers.push("SMTP");
    if (parsed.modules.messaging.webhook) providers.push("Webhook");
    if (parsed.modules.messaging.whatsapp) providers.push("WhatsApp");
  }

  var stateMap = {
    hospitalName: parsed.tenant && parsed.tenant.hospitalName ? parsed.tenant.hospitalName : "-",
    tenantKey: parsed.tenant && parsed.tenant.tenantKey ? parsed.tenant.tenantKey : "-",
    mode: parsed.services && parsed.services.mode ? parsed.services.mode : "-",
    providers: providers.length ? providers.join(" | ") : "None",
  };

  Object.keys(stateMap).forEach(function (key) {
    var targets = document.querySelectorAll('[data-state="' + key + '"]');
    targets.forEach(function (element) {
      element.textContent = stateMap[key];
    });
  });
})();
