const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".dash-view");
const roleCards = document.querySelectorAll(".role-card");
const authForm = document.getElementById("role-login-form");
const authOutput = document.getElementById("auth-output");
const googleBtn = document.getElementById("google-oauth-btn");
const clerkBtn = document.getElementById("clerk-oauth-btn");
const installBtn = document.getElementById("install-pwa-btn");

let deferredPrompt = null;

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    views.forEach((item) => item.classList.remove("active"));

    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.tab);
    if (target) {
      target.classList.add("active");
    }
  });
});

roleCards.forEach((card) => {
  card.addEventListener("click", () => {
    roleCards.forEach((item) => item.classList.remove("active"));
    card.classList.add("active");
    const role = card.dataset.role;
    const roleInput = document.getElementById("role");
    if (roleInput) {
      roleInput.value = role;
    }
  });
});

if (authForm) {
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(authForm);
    const payload = Object.fromEntries(data.entries());

    authOutput.textContent = JSON.stringify(
      {
        status: "demo-login-success",
        role: payload.role,
        tenantKey: payload.tenantKey,
        message: "Use /api/v1/auth/login endpoint in auth-service for backend login.",
      },
      null,
      2
    );
  });
}

if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    const tenant = document.getElementById("tenantKey")?.value || "default";
    const role = document.getElementById("role")?.value || "patient";
    authOutput.textContent = `Call GET /api/v1/auth/oauth/google/start?tenantKey=${tenant}&role=${role} to begin OAuth.`;
  });
}

if (clerkBtn) {
  clerkBtn.addEventListener("click", () => {
    const tenant = document.getElementById("tenantKey")?.value || "default";
    authOutput.textContent = `Call GET /api/v1/auth/oauth/clerk/start?tenantKey=${tenant} for Clerk setup payload.`;
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) {
    installBtn.disabled = false;
  }
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      authOutput.textContent = "PWA install prompt is not available in this browser context.";
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.disabled = true;
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}
