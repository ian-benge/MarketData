export type UserRole = "admin" | "member";

export type Permission =
  | "viewDashboard"
  | "viewReports"
  | "downloadReports"
  | "generateOnDemandReport"
  | "emailOnDemandReport"
  | "editWatchlists"
  | "editSectors"
  | "submitProposals"
  | "approveProposals"
  | "inviteUsers"
  | "deactivateUsers"
  | "changeRoles"
  | "configureSchedules"
  | "configureProviders"
  | "configureAiRouting"
  | "configureRecipients"
  | "configureThresholds"
  | "retryJobs"
  | "cancelJobs"
  | "resendDelivery"
  | "viewOpsDiagnostics"
  | "viewAuditLog";

const MEMBER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "viewDashboard",
  "viewReports",
  "downloadReports",
  "generateOnDemandReport",
  "editWatchlists",
  "editSectors",
  "submitProposals",
]);

const ADMIN_EXTRA: ReadonlySet<Permission> = new Set([
  "emailOnDemandReport",
  "approveProposals",
  "inviteUsers",
  "deactivateUsers",
  "changeRoles",
  "configureSchedules",
  "configureProviders",
  "configureAiRouting",
  "configureRecipients",
  "configureThresholds",
  "retryJobs",
  "cancelJobs",
  "resendDelivery",
  "viewOpsDiagnostics",
  "viewAuditLog",
]);

export function permissionsFor(role: UserRole): ReadonlySet<Permission> {
  if (role === "admin") {
    return new Set([...MEMBER_PERMISSIONS, ...ADMIN_EXTRA]);
  }
  return MEMBER_PERMISSIONS;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsFor(role).has(permission);
}

export function canInvite(role: UserRole): boolean {
  return hasPermission(role, "inviteUsers");
}

export function canApproveProposals(role: UserRole): boolean {
  return hasPermission(role, "approveProposals");
}

export function canEmailOnDemandReport(role: UserRole): boolean {
  return hasPermission(role, "emailOnDemandReport");
}

export function canConfigureProviders(role: UserRole): boolean {
  return hasPermission(role, "configureProviders");
}

export function canRetryJobs(role: UserRole): boolean {
  return hasPermission(role, "retryJobs");
}

export function canCancelJobs(role: UserRole): boolean {
  return hasPermission(role, "cancelJobs");
}

export function canResendDelivery(role: UserRole): boolean {
  return hasPermission(role, "resendDelivery");
}

export function canGenerateOnDemandReport(role: UserRole): boolean {
  return hasPermission(role, "generateOnDemandReport");
}

export function canEditWatchlists(role: UserRole): boolean {
  return hasPermission(role, "editWatchlists");
}

export function canEditSectors(role: UserRole): boolean {
  return hasPermission(role, "editSectors");
}

export function canSubmitProposals(role: UserRole): boolean {
  return hasPermission(role, "submitProposals");
}

export function canViewOpsDiagnostics(role: UserRole): boolean {
  return hasPermission(role, "viewOpsDiagnostics");
}

export function canConfigureSchedules(role: UserRole): boolean {
  return hasPermission(role, "configureSchedules");
}

export function canDeactivateUsers(role: UserRole): boolean {
  return hasPermission(role, "deactivateUsers");
}

export function canChangeRoles(role: UserRole): boolean {
  return hasPermission(role, "changeRoles");
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}
