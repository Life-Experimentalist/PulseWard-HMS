import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(
  defineConfig({
    title: "PulseWard HMS",
    description: "Open-source hospital management system documentation",
    base: "/docs/",

    // Local dev-portal URLs (localhost:4xxx) are intentional references, not
    // build-time-resolvable links; real external links are still checked.
    ignoreDeadLinks: "localhostLinks",

    head: [
      ["meta", { name: "color-scheme", content: "dark light" }],
      ["meta", { name: "theme-color", content: "#0f4c5c" }],
    ],

    themeConfig: {
      logo: { light: "/logo.svg", dark: "/logo.svg", alt: "PulseWard HMS" },

      nav: [
        { text: "Home", link: "/" },
        { text: "Architecture", link: "/architecture/" },
        { text: "Deploy", link: "/deploy" },
        { text: "API", link: "/api" },
        { text: "Changelog", link: "/changelog" },
        { text: "Landing ↗", link: "https://life-experimentalist.github.io/PulseWard-HMS/" },
      ],

      sidebar: [
        {
          text: "Getting Started",
          items: [
            { text: "Introduction", link: "/" },
            { text: "Quick Deploy", link: "/deploy" },
            { text: "Local Development", link: "/local-dev" },
          ],
        },
        {
          text: "Architecture Diagrams",
          items: [
            { text: "System Context", link: "/architecture/" },
            { text: "Auth Flow", link: "/architecture/auth-flow" },
            { text: "Data Model", link: "/architecture/data-model" },
            { text: "Service Map", link: "/architecture/service-map" },
            { text: "Deployment Topology", link: "/architecture/deployment" },
            { text: "Release Pipeline", link: "/architecture/release-pipeline" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "API Reference", link: "/api" },
            { text: "Environment Variables", link: "/env-vars" },
            { text: "Multi-Tenancy", link: "/multi-tenancy" },
            { text: "Changelog", link: "/changelog" },
          ],
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/Life-Experimentalist/PulseWard-HMS" },
      ],

      footer: {
        message: "Released under UNLICENSED.",
        copyright: "Copyright © 2026 Life Experimentalist",
      },

      search: { provider: "local" },
    },

    mermaid: {
      theme: "dark",
    },
  })
);
