// VIOLATION core-framework-free (x2): shared/core importing NestJS and Fastify.
import { Injectable } from "@nestjs/common";
import type { FastifyInstance } from "fastify";

export const decorator = Injectable;
export type App = FastifyInstance;
