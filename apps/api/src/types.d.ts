import type { AdminContext } from './services/admin-auth';
import type { ParentContext } from './services/parent-auth';
import type { StudentContext } from './services/student-auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
      student?: StudentContext;
      parent?: ParentContext;
    }
  }
}

export {};
