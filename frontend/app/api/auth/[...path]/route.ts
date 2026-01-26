import { authApiHandler } from "@neondatabase/neon-js/auth/next/server"

export const { DELETE, GET, PATCH, POST, PUT } = authApiHandler()
