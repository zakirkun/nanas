package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

// EncryptOptional encrypts plaintext with AES-GCM when key is 32 bytes (raw or base64); returns nils if key empty.
func EncryptOptional(keyRaw string, plaintext []byte) (ciphertext []byte, nonce []byte, err error) {
	k := deriveKey(keyRaw)
	if len(k) == 0 {
		return nil, nil, nil
	}
	b, err := aes.NewCipher(k)
	if err != nil {
		return nil, nil, err
	}
	gcm, err := cipher.NewGCM(b)
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return gcm.Seal(nil, nonce, plaintext, nil), nonce, nil
}

// DecryptOptional reverses EncryptOptional when key is configured.
func DecryptOptional(keyRaw string, ciphertext, nonce []byte) ([]byte, error) {
	if len(ciphertext) == 0 {
		return nil, nil
	}
	k := deriveKey(keyRaw)
	if len(k) == 0 {
		return nil, errors.New("secret key not configured")
	}
	b, err := aes.NewCipher(k)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(b)
	if err != nil {
		return nil, err
	}
	if len(nonce) != gcm.NonceSize() {
		return nil, errors.New("bad nonce")
	}
	return gcm.Open(nil, nonce, ciphertext, nil)
}

func deriveKey(keyRaw string) []byte {
	s := strings.TrimSpace(keyRaw)
	if s == "" {
		return nil
	}
	if b, err := base64.StdEncoding.DecodeString(s); err == nil && len(b) == 32 {
		return b
	}
	b := []byte(s)
	if len(b) != 32 {
		return nil
	}
	return b
}
