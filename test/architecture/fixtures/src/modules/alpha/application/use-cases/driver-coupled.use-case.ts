// VIOLATION application-no-infra (x4): application importing persistence/messaging drivers.
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { Db } from "mongodb";

export type Drivers = [KafkaJS.Kafka, PrismaClient, Redis, Db];
