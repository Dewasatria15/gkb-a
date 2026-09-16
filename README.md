# Website Informasi Peminjaman Ruangan GKB A

Website untuk informasi dan pengelolaan peminjaman ruangan Gedung Kuliah Bersama A.

## Fitur
- Login berbasis role: Admin, Dosen, Mahasiswa.
- Admin dapat tambah/edit/hapus jadwal.
- Dosen dan Mahasiswa hanya dapat melihat jadwal.
- Jam penggunaan dapat tambah/edit/hapus oleh Admin.
- Ruangan, fakultas/organisasi, dosen, dan mahasiswa dapat dikelola Admin.
- Pencegahan bentrok ruangan pada tanggal dan jam yang sama.
- Password disimpan sebagai hash dan session login dikelola server.
- Kontak Admin: Dewa Satria Irawan — 0895370767839.

## Menjalankan
1. Instal Node.js versi LTS.
2. Jalankan `npm install`.
3. Jalankan `npm start`.
4. Buka `http://localhost:3000`.

## Akun demo awal
- Admin: `admin` / `admin123`
- Dosen: `dosen` / `dosen123`
- Mahasiswa: `mahasiswa` / `mhs123`

Untuk deployment nyata, ubah password melalui environment variable `ADMIN_PASSWORD`, `DOSEN_PASSWORD`, `MAHASISWA_PASSWORD`, dan gunakan `SESSION_SECRET` yang kuat. SQLite membutuhkan penyimpanan persisten di hosting.
