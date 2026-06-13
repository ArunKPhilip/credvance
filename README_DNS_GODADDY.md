# Pointing your GoDaddy domain to Render (or other host)

1. After you deploy on Render, note the domain target Render gives (it will be something like `your-service.onrender.com` or an A record IP).
2. In GoDaddy: My Products → DNS → Manage DNS for `credvance.in`.
3. Add or update records:
   - If Render gives a CNAME for `www`:
     - Type: CNAME
     - Host: www
     - Points to: <render-provided-target>
     - TTL: 1 hour
   - For the root/apex (`@`):
     - Option A (recommended): Set up domain forwarding from `http://credvance.in` → `https://www.credvance.in` (HTTP → HTTPS) and rely on `www` CNAME for hosting.
     - Option B: If your host provides A records, add them as provided (Render may give A records for apex).
4. Wait for DNS propagation (a few minutes to 24 hours). Then add the domain in Render dashboard (or your host) so it can provision TLS certificates.

Notes:
- Use GoDaddy's forwarding if you want a simple redirect of apex to www.
- Ensure both `www.credvance.in` and `credvance.in` are added in your hosting provider so TLS is issued for both.
