# JobBoard Backend (NestJS)

Bản chuyển đổi backend JobBoard từ ASP.NET Core (`BE_c#`) sang NestJS + TypeScript.
Giữ nguyên kiến trúc phân lớp, route, JSON contract và quy tắc nghiệp vụ để frontend
(`fe/`) dùng được mà không cần sửa.

## Cấu trúc

```text
src/
  domain/          Entity, value object, exception và quy tắc nghiệp vụ (không phụ thuộc framework)
  application/     Use case (service), DTO và abstraction (abstract class dùng làm DI token)
  infrastructure/  Triển khai cụ thể: repository in-memory và PostgreSQL (pg + migration), PBKDF2, refresh token, JWT
  api/             Controller, DTO request, guard xác thực/phân quyền, bộ lọc lỗi ProblemDetails
  config/          Đọc cấu hình từ biến môi trường
  data/seed/       Dữ liệu tin tuyển dụng mẫu (jobs.json)
test/              E2E test (supertest)
```

Chiều phụ thuộc: `api → application → domain`, `infrastructure → application → domain`.
`domain` không import gì từ các lớp khác.

## Chạy

Yêu cầu Node.js 22.12+ và npm. Docker chỉ cần khi dùng PostgreSQL.

```bash
npm install
cp .env.example .env     # tùy chọn; có giá trị mặc định cho môi trường dev
npm run start:dev        # InMemory, http://localhost:5000/api
```

Chạy với PostgreSQL:

```bash
npm run db:up            # PostgreSQL 17 ở localhost:5434 (docker compose)
npm run start:pg         # PERSISTENCE_PROVIDER=PostgreSql + tự áp migration và seed
```

Tài liệu API: Swagger UI tại <http://localhost:5000/api/docs>, OpenAPI JSON tại
`/api/openapi.json` (bật mặc định ngoài production, tắt bằng `OPENAPI_ENABLED=false`).

Kiểm tra:

```bash
npm run build
npm test                 # unit test (không cần DB)
npm run test:e2e         # e2e toàn bộ luồng API với repository in-memory
npm run test:e2e:pg      # chạy lại e2e + kiểm thử tầng lưu trữ trên PostgreSQL thật (cần db:up)
npm run lint
```

## Cấu hình

Đọc từ biến môi trường (hoặc file `.env`), xem [.env.example](.env.example).

| Biến | Mặc định (dev) | Ghi chú |
| --- | --- | --- |
| `PORT` | `5000` | Frontend mặc định gọi `http://localhost:5000/api` |
| `JWT_SIGNING_KEY` | khóa dev | Tối thiểu 32 byte; **bắt buộc** khi `NODE_ENV=production`, thiếu thì app không khởi động |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `JobBoard.Api` / `JobBoard.Web` | |
| `JWT_ACCESS_TOKEN_MINUTES` | `15` | |
| `JWT_REFRESH_TOKEN_DAYS` | `7` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Danh sách origin, ngăn cách bằng dấu phẩy |
| `PERSISTENCE_PROVIDER` | `InMemory` | `InMemory` hoặc `PostgreSql` |
| `DATABASE_URL` | URL dev ở cổng 5434 | Bắt buộc khi `NODE_ENV=production` và dùng PostgreSql |
| `PERSISTENCE_APPLY_MIGRATIONS` | `false` | `true`: áp migration và nạp dữ liệu mẫu cho bảng còn trống khi khởi động |
| `OPENAPI_ENABLED` | bật ngoài production | Phát `/api/docs` và `/api/openapi.json` |

## Tài khoản demo

Seed khi khởi động (mật khẩu `JobBoard@123`):

| Vai trò | Email |
| --- | --- |
| Candidate | `candidate@jobboard.vn` |
| Employer (công ty 1) | `employer@jobboard.vn` |
| Admin | `admin@jobboard.vn` |

Mật khẩu lưu dạng PBKDF2-SHA256 (210.000 vòng, định dạng `v1.<vòng>.<salt>.<hash>`,
cùng định dạng với backend C#). Đăng nhập trả access token JWT 15 phút và refresh token
xoay vòng 7 ngày; chỉ hash SHA-256 của refresh token được lưu, và việc dùng lại token cũ
sẽ thu hồi toàn bộ phiên cùng họ token.

## API

Tất cả route nằm dưới tiền tố `/api`.

- `GET /health`
- `GET /jobs` (lọc `keyword`, `location`, `category`, `level`, `minimumSalary`, `skills` lặp lại, `page`, `pageSize`, `sort`), `GET /jobs/:id`
- `POST /auth/login`, `POST /auth/register/candidate`, `POST /auth/refresh`, `POST /auth/logout`, `PUT /auth/password`, `GET /auth/me`
- `POST /applications` (Candidate), `PATCH /applications/:id/status` (Employer)
- `GET|PUT /candidates/:id/profile`, `GET /candidates/:id/applications` (Candidate, chỉ của chính mình)
- `GET|POST /employers/:companyId/jobs`, `POST /employers/:companyId/jobs/:jobId/publish|close`, `GET /employers/:companyId/applications` (Employer, đúng công ty trong token)

Lỗi trả về dạng `application/problem+json` (`status`, `title`, `detail`, `instance`).

## Cơ sở dữ liệu

Truy cập PostgreSQL bằng `pg` với SQL tham số hóa, không dùng ORM: mapping giữa dòng dữ liệu
và entity domain nằm trong `infrastructure/postgres/row-mapper.ts`. Lược đồ tương đương
migration EF Core của backend C# (sequence cấp mã `job_ids`/`application_ids`/`user_ids`,
unique chống ứng tuyển trùng, index `(status, deadline)`, khóa ngoại).

- Migration là các module TypeScript trong `infrastructure/postgres/migrations/`, đăng ký ở
  `migrator.ts`. Chỉ thêm migration mới ở cuối danh sách, không sửa migration đã phát hành.
  Tất cả migration chưa chạy được áp trong một giao dịch, có khóa advisory để nhiều
  instance khởi động cùng lúc không đụng nhau.
- Giao dịch (`Database.transaction`) dùng cho đăng ký (tài khoản + hồ sơ) và xoay refresh token.
- Các tình huống chạy song song (ứng tuyển trùng, xoay token đồng thời) được chặn bằng ràng
  buộc/điều kiện ở chính câu lệnh SQL và có test tích hợp (`test/postgres.e2e-spec.ts`).

## Khác biệt so với backend C#

- Truy cập dữ liệu bằng `pg` + SQL tay thay cho EF Core; migration viết bằng TypeScript.
- Email hồ sơ và email tài khoản được so khớp không phân biệt hoa thường (unique index trên `lower(email)`).
- Tên ứng viên trong danh sách đơn ứng tuyển lấy từ repository ứng viên thay vì bảng tên cố định.
- Đổi email hồ sơ trùng ứng viên khác trả 409 (bản C# trả 500); vượt giới hạn số kỹ năng trả 400.
