# Bank J-NAL Backend API

Ini adalah repository untuk backend aplikasi **Bank J-NAL**, sebuah sistem perbankan digital modern yang dilengkapi dengan fitur kantong (pockets), manajemen kartu, transaksi QRIS, dan notifikasi.

## Spesifikasi Teknologi

Backend ini dibangun menggunakan teknologi modern untuk memastikan performa, keamanan, dan *type-safety*:
- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma ORM (v7)
- **Validation**: Zod (Schema validation)
- **Authentication**: JSON Web Tokens (JWT) & bcrypt (Password Hashing)
- **Development Tool**: `tsx` untuk eksekusi TypeScript on-the-fly

## Fitur Backend

Aplikasi ini menyediakan berbagai modul API (RESTful) untuk melayani aplikasi frontend dan mobile:

1. **Authentication (Otentikasi)**
   - Login pengguna dengan nomor handphone.
   - Manajemen Token (Access Token & Refresh Token).
   - Pengamanan rute menggunakan Auth Middleware.

2. **Manajemen Pengguna (Users)**
   - Mengambil informasi profil pengguna (nama, saldo, nomor telepon).
   - Verifikasi status akun (Active/Frozen).

3. **Manajemen Kartu (Cards)**
   - Menampilkan daftar kartu yang dimiliki pengguna.
   - Mengubah limit harian kartu (membutuhkan PIN).
   - Membekukan (Freeze) dan Membuka blokir (Unfreeze) kartu secara instan.

4. **Kantong Keuangan (Pockets)**
   - Pembuatan dan manajemen kantong tabungan terpisah.
   - Penentuan target tabungan (Target Amount) untuk setiap kantong.

5. **Transaksi & Transfer (Transactions)**
   - Transfer saldo antar akun.
   - Pembayaran menggunakan QRIS.
   - Riwayat transaksi dengan fitur filter, pencarian, dan pagination.

6. **Promosi & Notifikasi (Promotions & Notifications)**
   - Mengambil data banner promosi aktif.
   - Sistem notifikasi in-app untuk pengguna (Alerts & Inbox).
   - Fitur *Mark as Read* untuk notifikasi.

7. **Dashboard & Shortcuts**
   - API khusus untuk merender beranda aplikasi (Dashboard).
   - Fitur kustomisasi shortcut/menu cepat pengguna.

8. **Admin Panel**
   - Rute terpisah dengan Middleware Admin.
   - Monitoring keseluruhan transaksi sistem dan manajemen pengguna oleh administrator.

## Cara Menjalankan (Running the App)

Ikuti langkah-langkah di bawah ini untuk menjalankan aplikasi di lingkungan pengembangan (lokal):

### 1. Prasyarat
Pastikan Anda sudah menginstal:
- [Node.js](https://nodejs.org/) (Versi 20+ direkomendasikan)
- [PostgreSQL](https://www.postgresql.org/) (Database server)

### 2. Instalasi Dependensi
Jalankan perintah berikut di root folder project:
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin file `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Isi konfigurasi standar `.env`:
```env
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bank_jnal?schema=public"
JWT_SECRET="jnal_super_secret_key_2026_demo"
JWT_REFRESH_SECRET="jnal_refresh_super_secret_key_2026_demo"
```

### 4. Setup Database & Seeder Demo (Prisma)
Sinkronkan skema database dan jalankan seeder untuk mengisi data akun demo otomatis:
```bash
npm run db:push
npm run seed
```

### 5. Jalankan Development Server
Gunakan script `dev` yang sudah disediakan (menggunakan `tsx watch` untuk auto-reload):
```bash
npm run dev
```

Jika berhasil, backend akan berjalan di:
- **API Server**: `http://localhost:3001`
- **Swagger API Docs**: `http://localhost:3001/api-docs`
