# SSH Tunnel Proxy Server for Department Server Access

A Node.js proxy server deployed on **Vercel** that forwards HTTP requests to another private server via **SSH tunneling**. Ideal for accessing restricted backend APIs without direct public exposure.

---

## 🌟 Features
- **Secure Tunneling**: Routes traffic through SSH to bypass firewall restrictions.
- **Vercel Hosting**: No need for a dedicated server; runs on serverless functions.
- **Environment Variables**: Stores credentials securely (no hardcoding).
- **Automatic Forwarding**: All requests to `/` are proxied to the department server.

---

## 🛠️ How It Works
1. **Vercel Server** receives HTTP requests.
2. **SSH Tunnel** is established to your department server.
3. **Proxy Middleware** forwards requests to the department server's Node.js backend.
4. **Response** is sent back to the client via Vercel.

```plaintext
Client → Vercel (Proxy) → SSH Tunnel → Department Server (Node.js)
