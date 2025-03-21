import { pack, unpack } from 'msgpackr';
import { Key } from 'rtc-pair-socket';
import { z } from 'zod';

export const PublicKey = z.object({
  publicKey: z.instanceof(Uint8Array),
});

// eslint-disable-next-line no-redeclare
export type PublicKey = z.TypeOf<typeof PublicKey>;

export default class EcdhKeyPair {
  private constructor(
    public publicKey: CryptoKey,
    public privateKey: CryptoKey,
  ) {}

  static async get(name: string) {
    const storageKey = `ecdh-key-pair-${name}`;
    const stored = localStorage.getItem(storageKey);

    if (stored !== null) {
      return await EcdhKeyPair.decode(stored);
    }

    const key = await EcdhKeyPair.generate();
    localStorage.setItem(storageKey, await key.encode());

    return key;
  }

  async encodePublicKey() {
    return {
      publicKey: new Uint8Array(await crypto.subtle.exportKey(
        'raw',
        this.publicKey,
      )),
    };
  }

  async deriveSharedKey(externalPublicKey: PublicKey) {
    const externalCryptoPublicKey = await EcdhKeyPair.decodePublicKey(
      externalPublicKey,
    );

    return new Key(new Uint8Array(await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: externalCryptoPublicKey,
      },
      this.privateKey,
      256, // Length of derived key in bits
    )));
  }

  private static async decodePublicKey(publicKey: PublicKey) {
    return await crypto.subtle.importKey(
      'raw',
      publicKey.publicKey,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      [],
    );
  }

  private static async generate() {
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits'],
    );

    return new EcdhKeyPair(publicKey, privateKey);
  }

  async encode() {
    return packString({
      publicKey: new Uint8Array(await crypto.subtle.exportKey(
        'raw',
        this.publicKey,
      )),
      privateKey: new Uint8Array(await crypto.subtle.exportKey(
        'pkcs8',
        this.privateKey,
      )),
    });
  }

  static async decode(encoded: string) {
    const raw = unpackString(encoded) as {
      publicKey: Uint8Array;
      privateKey: Uint8Array;
    };

    const publicKey = await crypto.subtle.importKey(
      'raw',
      raw.publicKey,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      [],
    );

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      raw.privateKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, // Can be exported again
      ['deriveKey', 'deriveBits'], // ECDH usage
    );

    return new EcdhKeyPair(publicKey, privateKey);
  }
}

function packString(value: unknown) {
  return encodeBase64(pack(value));
}

function unpackString(str: string) {
  return unpack(decodeBase64(str));
}

function encodeBase64(uint8Array: Uint8Array) {
  return btoa(String.fromCharCode(...uint8Array));
}

function decodeBase64(base64String: string) {
  return new Uint8Array([...atob(base64String)].map(c => c.charCodeAt(0)));
}
