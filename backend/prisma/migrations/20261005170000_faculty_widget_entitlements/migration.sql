CREATE TABLE "role_widget_entitlements" (
  "tenantId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "widgetKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "role_widget_entitlements_pkey" PRIMARY KEY ("tenantId", "roleKey", "widgetKey"),
  CONSTRAINT "role_widget_entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
