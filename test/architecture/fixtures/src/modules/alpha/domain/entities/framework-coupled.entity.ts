// VIOLATION domain-pure (x2): domain importing a framework and zod.
import { Injectable } from "@nestjs/common";
import { z } from "zod";

export const decorator = Injectable;
export const schema = z.string();
