import { HttpError } from '../lib/http.js';

/** Validates req.body / req.query / req.params with Zod and replaces them with the parsed value. */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, details[0]?.message || 'Invalid request', details));
    }
    if (part === 'query') req.validQuery = result.data;
    else req[part] = result.data;
  }
  next();
};
