export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "BANK J-NAL REST API Documentation",
    version: "1.0.0",
    description: "Dokumentasi Lengkap API Bank J-NAL Backend (Next-Gen Digital Banking & Admin Management System). Mendukung Autentikasi JWT, Manajemen Kantong & Kartu, Transfer Antar Rekening, Pembayaran QRIS, Notifikasi Realtime WebSocket, serta Admin Broadcast Studio.",
    contact: {
      name: "Bank J-NAL Engineering Team",
      email: "support@bankjnal.com"
    }
  },
  servers: [
    {
      url: "http://localhost:3001/api/v1",
      description: "Local Development Server"
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Masukkan JWT Access Token dengan format: Bearer <token>"
      }
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          meta: { type: "object", nullable: true }
        }
      },
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Deskripsi pesan error" },
              details: { type: "object", nullable: true }
            }
          }
        }
      }
    }
  },
  security: [
    { bearerAuth: [] }
  ],
  paths: {
    // ------------------------------------------------------------------------
    // AUTH & ONBOARDING
    // ------------------------------------------------------------------------
    "/auth/register": {
      post: {
        tags: ["Auth & Onboarding"],
        summary: "Pendaftaran Nasabah Baru (Buka Rekening)",
        description: "Mendaftarkan nasabah baru secara instan, otomatis membuat Kantong Utama, saldo awal Rp 1.000.000, dan Kartu Digital VISA aktif.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fullName", "phone", "password", "pin"],
                properties: {
                  fullName: { type: "string", example: "Budi Santoso" },
                  phone: { type: "string", example: "081234567890" },
                  email: { type: "string", example: "budi@example.com" },
                  password: { type: "string", example: "password123" },
                  pin: { type: "string", example: "123456", description: "6 digit numeric PIN" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Pendaftaran berhasil, mengembalikan token & user profile" },
          "400": { description: "Validasi data gagal" },
          "409": { description: "Nomor HP atau email sudah terdaftar" }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Auth & Onboarding"],
        summary: "Login Nasabah / Admin",
        description: "Autentikasi menggunakan Nomor HP / Email dan Password.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  phone: { type: "string", example: "081234567890" },
                  email: { type: "string", example: "admin@jnal.bank" },
                  password: { type: "string", example: "password123" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Login berhasil, mengembalikan JWT tokens" },
          "401": { description: "Kredensial tidak valid" }
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth & Onboarding"],
        summary: "Refresh Access Token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Access token baru berhasil diterbitkan" },
          "401": { description: "Refresh token tidak valid" }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Auth & Onboarding"],
        summary: "Logout Pengguna",
        responses: {
          "204": { description: "Berhasil logout" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // DASHBOARD & PROFIL
    // ------------------------------------------------------------------------
    "/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Ambil Ringkasan Dashboard Nasabah",
        description: "Mengambil data total saldo gabungan, daftar kantong, kartu aktif, dan riwayat mutasi transaksi terakhir.",
        responses: {
          "200": { description: "Data ringkasan dashboard" }
        }
      }
    },
    "/me": {
      get: {
        tags: ["User Profile"],
        summary: "Ambil Profil Pengguna Saat Ini",
        responses: {
          "200": { description: "Data profil user" }
        }
      },
      patch: {
        tags: ["User Profile"],
        summary: "Perbarui Data Profil",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "user_baru@example.com" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Profil berhasil diperbarui" }
        }
      }
    },
    "/me/security/pin": {
      put: {
        tags: ["User Profile"],
        summary: "Ubah PIN Transaksi",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["oldPin", "newPin"],
                properties: {
                  oldPin: { type: "string", example: "123456" },
                  newPin: { type: "string", example: "654321" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "PIN berhasil diperbarui" },
          "400": { description: "PIN lama salah / format tidak valid" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // KANTONG (POCKETS)
    // ------------------------------------------------------------------------
    "/pockets": {
      get: {
        tags: ["Pockets"],
        summary: "Ambil Daftar Kantong Nasabah",
        responses: {
          "200": { description: "Daftar kantong nasabah beserta saldo" }
        }
      },
      post: {
        tags: ["Pockets"],
        summary: "Buat Kantong Baru (Tabungan / Pengeluaran)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "type"],
                properties: {
                  name: { type: "string", example: "Dana Liburan" },
                  type: { type: "string", enum: ["SAVING", "SPENDING", "SHARED"], example: "SAVING" },
                  targetAmount: { type: "number", example: 5000000 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Kantong baru berhasil dibuat" }
        }
      }
    },
    "/pockets/{pocketId}": {
      get: {
        tags: ["Pockets"],
        summary: "Detail Kantong",
        parameters: [
          { name: "pocketId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Detail kantong" }
        }
      },
      patch: {
        tags: ["Pockets"],
        summary: "Ubah Nama / Target Kantong",
        parameters: [
          { name: "pocketId", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Tabungan Qurban" },
                  targetAmount: { type: "number", example: 4000000 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Kantong berhasil diupdate" }
        }
      },
      delete: {
        tags: ["Pockets"],
        summary: "Hapus Kantong (Saldo otomatis dipindah ke Kantong Utama)",
        parameters: [
          { name: "pocketId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Kantong berhasil dihapus" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // KARTU (CARDS)
    // ------------------------------------------------------------------------
    "/cards": {
      get: {
        tags: ["Cards"],
        summary: "Ambil Daftar Kartu Nasabah",
        description: "Mengembalikan kartu debit digital / fisik yang dimiliki beserta relasi pemilik dan sumber kantong dana.",
        responses: {
          "200": { description: "Daftar kartu nasabah" }
        }
      },
      post: {
        tags: ["Cards"],
        summary: "Penerbitan Kartu Baru (Card Issuance)",
        description: "Membuat kartu debit DIGITAL VISA atau PHYSICAL GPN baru dengan verifikasi PIN.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cardType", "pocketId", "pin"],
                properties: {
                  cardType: { type: "string", enum: ["DIGITAL", "PHYSICAL"], example: "DIGITAL" },
                  cardName: { type: "string", example: "Kartu Belanja Online" },
                  pocketId: { type: "string", example: "pocket-uuid" },
                  dailyLimit: { type: "number", example: 15000000 },
                  pin: { type: "string", example: "123456" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Kartu baru berhasil diterbitkan" }
        }
      }
    },
    "/cards/{cardId}/limit": {
      patch: {
        tags: ["Cards"],
        summary: "Atur Limit Transaksi Harian Kartu",
        parameters: [
          { name: "cardId", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["dailyLimit", "pin"],
                properties: {
                  dailyLimit: { type: "number", example: 25000000 },
                  pin: { type: "string", example: "123456" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Limit harian berhasil diubah" }
        }
      }
    },
    "/cards/{cardId}/freeze": {
      post: {
        tags: ["Cards"],
        summary: "Bekukan Kartu Sementara (Freeze)",
        parameters: [
          { name: "cardId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Kartu berhasil dibekukan" }
        }
      }
    },
    "/cards/{cardId}/unfreeze": {
      post: {
        tags: ["Cards"],
        summary: "Buka Blokir Kartu (Unfreeze)",
        parameters: [
          { name: "cardId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Kartu aktif kembali" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // TRANSFER & TOP UP
    // ------------------------------------------------------------------------
    "/transfers/inquiry": {
      post: {
        tags: ["Transfers"],
        summary: "Inquiry Rekening Tujuan",
        description: "Memeriksa validitas nomor rekening tujuan dan mengambil nama pemilik rekening sebelum transfer.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetAccountNumber"],
                properties: {
                  targetAccountNumber: { type: "string", example: "123456789010" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Data pemilik rekening ditemukan" },
          "404": { description: "Rekening tujuan tidak ditemukan" }
        }
      }
    },
    "/transfers": {
      post: {
        tags: ["Transfers"],
        summary: "Eksekusi Transfer Dana",
        description: "Melakukan transfer dana antar rekening dengan validasi saldo, PIN keamanan, dan pemicuan notifikasi realtime ke penerima.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sourcePocketId", "targetAccountNumber", "amount", "pin"],
                properties: {
                  sourcePocketId: { type: "string", example: "source-pocket-uuid" },
                  targetAccountNumber: { type: "string", example: "123456789010" },
                  amount: { type: "number", example: 100000 },
                  notes: { type: "string", example: "Bayar makan siang" },
                  pin: { type: "string", example: "123456" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Transfer berhasil dieksekusi" },
          "400": { description: "Saldo tidak mencukupi / PIN salah" }
        }
      }
    },
    "/transfers/topup": {
      post: {
        tags: ["Transfers"],
        summary: "Top Up Saldo Kantong",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pocketId", "amount"],
                properties: {
                  pocketId: { type: "string", example: "pocket-uuid" },
                  amount: { type: "number", example: 250000 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Top up saldo berhasil" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // TRANSAKSI (MUTASI & ANALYTICS)
    // ------------------------------------------------------------------------
    "/transactions": {
      get: {
        tags: ["Transactions"],
        summary: "Riwayat Transaksi (Mutasi Rekening)",
        parameters: [
          { name: "pocketId", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["INCOME", "EXPENSE", "TRANSFER"] } },
          { name: "limit", in: "query", schema: { type: "integer", example: 20 } },
          { name: "page", in: "query", schema: { type: "integer", example: 1 } }
        ],
        responses: {
          "200": { description: "Daftar riwayat transaksi nasabah" }
        }
      }
    },
    "/transactions/stats/summary": {
      get: {
        tags: ["Transactions"],
        summary: "Statistik Keuangan & Analytics",
        description: "Total pemasukan, pengeluaran, dan grafik arus kas bulanan.",
        responses: {
          "200": { description: "Statistik mutasi keuangan" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // QRIS
    // ------------------------------------------------------------------------
    "/qris/resolve": {
      post: {
        tags: ["QRIS"],
        summary: "Scan / Resolve String QRIS",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["qrCodeData"],
                properties: {
                  qrCodeData: { type: "string", example: "QRIS.ID.JNAL.MERCHANT123" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Data merchant QRIS terverifikasi" }
        }
      }
    },
    "/qris/payments": {
      post: {
        tags: ["QRIS"],
        summary: "Bayar Transaksi Merchant QRIS",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["merchantId", "amount", "pin"],
                properties: {
                  merchantId: { type: "string", example: "merchant-id" },
                  amount: { type: "number", example: 45000 },
                  pocketId: { type: "string" },
                  pin: { type: "string", example: "123456" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Pembayaran QRIS berhasil" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // NOTIFIKASI
    // ------------------------------------------------------------------------
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Ambil Kotak Masuk Notifikasi Pengguna",
        responses: {
          "200": { description: "Daftar notifikasi transaksi, promo, dan sistem" }
        }
      }
    },
    "/notifications/{id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Tandai Notifikasi Sudah Dibaca",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Status notifikasi diupdate" }
        }
      }
    },
    "/notifications/read-all": {
      post: {
        tags: ["Notifications"],
        summary: "Tandai Semua Notifikasi Sudah Dibaca",
        responses: {
          "200": { description: "Semua notifikasi ditandai read" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // PROMOSI & BANNER
    // ------------------------------------------------------------------------
    "/promotions": {
      get: {
        tags: ["Promotions"],
        summary: "Daftar Promo & Penawaran Aktif",
        responses: {
          "200": { description: "Daftar promo untuk banner mobile app" }
        }
      }
    },

    // ------------------------------------------------------------------------
    // ADMIN CONSOLE MANAGEMENT
    // ------------------------------------------------------------------------
    "/admin/stats": {
      get: {
        tags: ["Admin Management"],
        summary: "Statistik Dashboard Admin",
        responses: {
          "200": { description: "Total nasabah, total volume transaksi, dan perputaran saldo" }
        }
      }
    },
    "/admin/monitoring": {
      get: {
        tags: ["Admin Management"],
        summary: "Live System Monitoring",
        responses: {
          "200": { description: "Metrik performa database, server uptime, dan latency" }
        }
      }
    },
    "/admin/users": {
      get: {
        tags: ["Admin Management"],
        summary: "Daftar Pengguna & Nasabah",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", example: 50 } },
          { name: "page", in: "query", schema: { type: "integer", example: 1 } }
        ],
        responses: {
          "200": { description: "Daftar seluruh user" }
        }
      },
      post: {
        tags: ["Admin Management"],
        summary: "Buat Pengguna / Admin Baru",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fullName", "email", "phone", "role"],
                properties: {
                  fullName: { type: "string", example: "Staff Admin" },
                  email: { type: "string", example: "staff@jnal.bank" },
                  phone: { type: "string", example: "081122334455" },
                  role: { type: "string", enum: ["CUSTOMER", "ADMIN", "SUPER_ADMIN"], example: "ADMIN" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "User baru berhasil dibuat" }
        }
      }
    },
    "/admin/users/{id}/status": {
      patch: {
        tags: ["Admin Management"],
        summary: "Ubah Status User (ACTIVE / SUSPENDED / BLOCKED)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "BLOCKED"], example: "SUSPENDED" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Status user berhasil diperbarui" }
        }
      }
    },
    "/admin/notifications": {
      get: {
        tags: ["Admin Management"],
        summary: "Riwayat Siaran Broadcast Notifikasi",
        responses: {
          "200": { description: "Daftar riwayat broadcast notifikasi" }
        }
      },
      post: {
        tags: ["Admin Management"],
        summary: "Kirim Blast Notifikasi Real-time",
        description: "Melakukan siaran notifikasi massal ke database PostgreSQL dan memancarkan event WebSocket secara real-time ke smartphone seluruh nasabah.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "message"],
                properties: {
                  title: { type: "string", example: "🎁 Promo Diskon 50% Akhir Bulan!" },
                  message: { type: "string", example: "Nikmati bebas biaya transfer dan diskon top up ke semua e-wallet." },
                  type: { type: "string", enum: ["PROMO", "SECURITY", "SYSTEM", "TRANSACTION"], example: "PROMO" },
                  target: { type: "string", enum: ["ALL", "CUSTOMERS", "SPECIFIC"], example: "ALL" },
                  userId: { type: "string", description: "Diisi jika target adalah SPECIFIC" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Blast notifikasi berhasil terkirim" }
        }
      }
    },
    "/admin/promotions": {
      get: {
        tags: ["Admin Management"],
        summary: "Daftar Promosi Admin",
        responses: {
          "200": { description: "List promosi" }
        }
      },
      post: {
        tags: ["Admin Management"],
        summary: "Buat Banner Promosi Baru",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { type: "string", example: "Cashback QRIS 20%" },
                  description: { type: "string", example: "Berlaku di seluruh merchant mitra Bank J-NAL" },
                  discountPercentage: { type: "number", example: 20 },
                  bannerUrl: { type: "string", example: "https://example.com/banner.jpg" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Promosi berhasil dibuat" }
        }
      }
    }
  }
};
