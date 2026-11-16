-- CreateEnum
CREATE TYPE "NexoraActionStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "nexora_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nexora_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexora_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "blocks" JSONB,
    "toolActivity" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nexora_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexora_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "NexoraActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nexora_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nexora_conversations_tenantId_userId_updatedAt_idx" ON "nexora_conversations"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "nexora_messages_conversationId_createdAt_idx" ON "nexora_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "nexora_actions_tenantId_userId_status_idx" ON "nexora_actions"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "nexora_actions_conversationId_idx" ON "nexora_actions"("conversationId");

-- AddForeignKey
ALTER TABLE "nexora_conversations" ADD CONSTRAINT "nexora_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexora_conversations" ADD CONSTRAINT "nexora_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexora_messages" ADD CONSTRAINT "nexora_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "nexora_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexora_actions" ADD CONSTRAINT "nexora_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexora_actions" ADD CONSTRAINT "nexora_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexora_actions" ADD CONSTRAINT "nexora_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "nexora_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

