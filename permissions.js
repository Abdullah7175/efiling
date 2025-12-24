export const ROLES = {
    1: [
      "view:comments",
      "create:comments",
      "update:comments",
      "delete:comments",
    ],
    2: ["view:comments", "create:comments", "delete:comments"],
    3: ["view:comments", "create:comments"],
  };
  
export function hasPermission(user, permission) {
    return ROLES[user.role].includes(permission);
  }
  