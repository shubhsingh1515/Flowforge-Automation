# Outbound Webhook HMAC Signature Verification

To ensure that incoming webhooks originated from FlowForge and were not tampered with in transit or spoofed by malicious third parties, every request includes an HMAC-SHA256 signature header.

---

## 1. Headers Included with Every Delivery

| Header Name | Example Value | Description |
|---|---|---|
| `X-FlowForge-Signature` | `sha256=a1b2c3d4e5f6...` | Hex-encoded HMAC-SHA256 signature of the raw HTTP request body |
| `X-FlowForge-Event` | `workflow.created` | The event type name |
| `X-FlowForge-Delivery-Id` | `del_01j7xyz...` | Unique identifier of this delivery record |
| `User-Agent` | `FlowForge-Outbound-Webhook/1.0` | Custom FlowForge delivery user agent |

---

## 2. Verification Algorithm

1. Extract the raw, unparsed HTTP request body string. (Do NOT use parsed JSON, as key ordering and whitespace differences will alter the hash).
2. Read the signature from the `X-FlowForge-Signature` header and strip the `sha256=` prefix.
3. Compute the HMAC-SHA256 of the raw body using your endpoint's signing secret (`whsec_...`).
4. Perform a constant-time comparison between the computed HMAC digest and the signature header to prevent timing attacks.

---

## 3. Node.js Verification Code Example

```javascript
import crypto from "crypto";

export function verifyFlowForgeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signatureHeader.slice(7); // Remove 'sha256='
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Constant-time comparison prevents timing side-channel attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "utf8"),
    Buffer.from(computedSignature, "utf8")
  );
}
```

---

## 4. Python Verification Code Example

```python
import hmac
import hashlib

def verify_flowforge_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    
    expected_signature = signature_header[7:]
    computed_signature = hmac.new(
        key=secret.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, computed_signature)
```
