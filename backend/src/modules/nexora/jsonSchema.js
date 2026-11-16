/**
 * JSON Schema for a tool's zod input schema, so each tool declares its arguments once: the zod schema validates
 * every call on the server, and this rendering of the same schema is what the model is shown. Covers the subset
 * the tool definitions use (objects, strings, numbers, booleans, enums, arrays, optional/default/nullable).
 */
export function toJsonSchema(schema) {
  const def = schema._def;
  const described = (out) => (schema.description ? { ...out, description: schema.description } : out);
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      return described({ type: 'object', properties, required, additionalProperties: false });
    }
    case 'ZodString': {
      const out = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') out.minLength = check.value;
        if (check.kind === 'max') out.maxLength = check.value;
        if (check.kind === 'uuid') out.format = 'uuid';
        if (check.kind === 'regex') out.pattern = check.regex.source;
      }
      return described(out);
    }
    case 'ZodNumber': {
      const out = { type: def.checks?.some((c) => c.kind === 'int') ? 'integer' : 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') out.minimum = check.value;
        if (check.kind === 'max') out.maximum = check.value;
      }
      return described(out);
    }
    case 'ZodBoolean':
      return described({ type: 'boolean' });
    case 'ZodEnum':
      return described({ type: 'string', enum: [...def.values] });
    case 'ZodArray': {
      const out = { type: 'array', items: toJsonSchema(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return described(out);
    }
    case 'ZodOptional':
    case 'ZodNullable':
      return { ...toJsonSchema(def.innerType), ...(schema.description ? { description: schema.description } : {}) };
    case 'ZodDefault':
      return { ...toJsonSchema(def.innerType), default: def.defaultValue(), ...(schema.description ? { description: schema.description } : {}) };
    case 'ZodEffects':
      return toJsonSchema(def.schema);
    default:
      throw new Error(`Nexora tool schemas do not support ${def.typeName}.`);
  }
}
