// ===== Passkey (WebAuthn) 封装：直接使用 @simplewebauthn/browser，不自造轮子 =====
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export { startAuthentication, startRegistration };

// 判断浏览器是否支持 WebAuthn
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.credentials && !!window.PublicKeyCredential;
}
