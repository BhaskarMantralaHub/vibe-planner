# Adding a New Tool

1. Create folder under `app/(tools)/your-tool/`
2. Add `page.tsx` inside it
3. Add entry to `lib/nav.ts` with `roles` array specifying which user roles can see it
4. Create Zustand store in `stores/` if the tool has data
5. Create types in `types/` for TypeScript definitions
6. Wrap page content in `<AuthGate>` (with optional `variant` for themed login)
7. Wrap page content in `<RoleGate allowed={['role1', 'admin']}>` for access control
8. Test locally with `npm run dev`
9. Push to feature branch, create PR, merge when ready
