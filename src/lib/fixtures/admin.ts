export const fixtureAdmin = {
  team: [
    {
      id: "demo-admin",
      email: "admin@demo.local",
      displayName: "Demo Admin",
      role: "admin" as const,
      isActive: true,
    },
    {
      id: "demo-member",
      email: "member@demo.local",
      displayName: "Demo Member",
      role: "member" as const,
      isActive: true,
    },
  ],
  invitations: [
    {
      id: "inv-1",
      email: "analyst@example.com",
      role: "member" as const,
      status: "pending" as const,
      expiresAt: "2026-08-17T00:00:00.000Z",
    },
  ],
  schedule: {
    timezone: "America/Chicago",
    editions: [
      { edition: "premarket", localTime: "07:30" },
      { edition: "midday", localTime: "11:30" },
      { edition: "close_postmarket", localTime: "16:00" },
    ],
    graceMinutes: 15,
  },
  sources: [
    { id: "mock", name: "Mock providers", enabled: true, health: "healthy" },
    { id: "finnhub", name: "Finnhub", enabled: false, health: "disabled" },
    { id: "fred", name: "FRED", enabled: false, health: "disabled" },
    { id: "rss", name: "Configured RSS", enabled: false, health: "disabled" },
  ],
  aiRouting: {
    defaultProvider: "anthropic",
    fallbackOrder: ["anthropic", "gemini"],
    promptVersion: "v1-demo",
  },
  jobs: [
    {
      id: "job-demo-001",
      reportId: "rpt-demo-001",
      status: "completed",
      stage: "completed",
      updatedAt: "2026-08-10T16:35:00.000Z",
    },
    {
      id: "job-demo-004",
      reportId: "rpt-demo-ondemand",
      status: "collecting_sources",
      stage: "collecting_sources",
      updatedAt: "2026-08-10T17:01:00.000Z",
    },
  ],
  deliveries: [
    {
      id: "del-1",
      reportId: "rpt-demo-001",
      status: "delivered",
      recipientCount: 2,
      attemptedAt: "2026-08-10T16:36:00.000Z",
    },
    {
      id: "del-2",
      reportId: "rpt-demo-002",
      status: "failed",
      recipientCount: 2,
      attemptedAt: "2026-08-10T12:41:00.000Z",
    },
  ],
  audit: [
    {
      id: "aud-1",
      actor: "admin@demo.local",
      action: "approve_proposal",
      target: "prop-2",
      at: "2026-08-06T12:10:00.000Z",
    },
    {
      id: "aud-2",
      actor: "admin@demo.local",
      action: "invite_user",
      target: "analyst@example.com",
      at: "2026-08-08T09:00:00.000Z",
    },
  ],
};
