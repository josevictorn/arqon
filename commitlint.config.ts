export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "iam",
        "tenancy",
        "billing",
        "notifications",
        "audit",
        "shared",
        "infra",
        "integrations",
        "docs",
        "deps",
        "ci",
      ],
    ],
  },
};
