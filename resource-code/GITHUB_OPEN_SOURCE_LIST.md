# Skynix Manager — GitHub paylaşım listesi

## Paylaşılabilir kaynaklar

- `index.html`
- `main.js` (gizli anahtarlar temizlendikten sonra)
- `preload.js`
- `package.json`
- `package-lock.json`
- `index.json`
- `skynix_website.html` (kullanılıyorsa)
- `icon.png`, `icon.ico`
- `README.md`, `LICENSE`, `.gitignore`

## GitHub'a yüklenmemesi gerekenler

`node_modules`, `dist`, `build`, `installed`, `profiles`, `userdata`, `overlay`, `selected-overlay-mods`, `skyfixer-backups`, `skyfixer-config`, `store-installed` ve `champion-defaults` klasörleri kullanıcıya özel veya üretilmiş veridir. `tools` içindeki `.exe`, `.dll` ve `.zip` dosyaları da kaynak kodu değildir; lisansları uygunsa ayrı bir release'e konulmalıdır.

## Yayınlamadan önce güvenlik kontrolü

`main.js` içinde Discord OAuth Client Secret, `index.html` içinde yönetici anahtarı bulunuyor. Bunları GitHub'a koymayın. Discord Developer Portal'dan OAuth secret'ı yenileyin/iptal edin ve yönetici anahtarını değiştirin. Gerçek değerleri `.env` veya `secrets.local.js` içinde tutun; bu dosyalar `.gitignore` ile hariç bırakılmıştır.

GitHub'da yeni bir repository oluşturup bu dosyaları yükleyin. İlk commit'ten önce tüm geçmişte de secret bulunmadığını kontrol edin; secret daha önce commit edildiyse yalnızca dosyadan silmek yetmez, anahtarı mutlaka rotate/revoke edin.
