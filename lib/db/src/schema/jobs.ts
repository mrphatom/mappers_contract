import { pgTable, serial, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobStatusEnum = pgEnum("job_status", ["pending", "completed", "cancelled"]);

export const jobsTable = pgTable("jobs", {
  id:                 serial("id").primaryKey(),
  jobId:              text("job_id").notNull(),
  escrowPubkey:       text("escrow_pubkey").notNull().unique(),
  clientPubkey:       text("client_pubkey").notNull(),
  freelancerPubkey:   text("freelancer_pubkey").notNull(),
  oraclePubkey:       text("oracle_pubkey").notNull(),
  amountLamports:     text("amount_lamports").notNull(),
  status:             jobStatusEnum("status").notNull().default("pending"),
  description:        text("description"),
  acceptanceCriteria: text("acceptance_criteria"),
  txSig:              text("tx_sig"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectJobSchema = createSelectSchema(jobsTable);

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
