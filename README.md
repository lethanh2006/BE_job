# JobBoard Backend (NestJS)

Bản chuyển đổi backend JobBoard từ ASP.NET Core (`BE_c#`) sang NestJS + TypeScript.
Giữ nguyên kiến trúc phân lớp, route, JSON contract và quy tắc nghiệp vụ để frontend
(`fe/`) dùng được mà không cần sửa.

## Cấu trúc

```text
src/
  domain/          Entity, value object, exception và quy tắc nghiệp vụ (không phụ thuộc framework)
  application/     Use case (service), DTO và abstraction (abstract class dùng làm DI token)
  infrastructure/  Triển khai cụ thể: repository in-memory, PBKDF2, refresh token, JWT
  api/             Controller, DTO request, guard xác thực/phân quyền, bộ lọc lỗi ProblemDetails
  config/          Đọc cấu hình từ biến môi trường
  data/seed/       Dữ liệu tin tuyển dụng mẫu (jobs.json)
test/              E2E test (supertest)
```

Chiều phụ thuộc: `api → application → domain`, `infrastructure → application → domain`.
`domain` không import gì từ các lớp khác.

## Chạy

Yêu cầu Node.js 20.12+ (dùng `process.loadEnvFile`) và npm.

```bash
npm install
cp .env.example .env     # tùy chọn; có giá trị mặc định cho môi trường dev
npm run start:dev        # http://localhost:5000/api
```

Kiểm tra:

```bash
npm run build
npm test                 # unit test
npm run test:e2e         # e2e test toàn bộ luồng API
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
| `PERSISTENCE_PROVIDER` | `InMemory` | Hiện chỉ hỗ trợ `InMemory` |

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

## Khác biệt so với backend C#

- Chưa có chế độ PostgreSQL/EF Core: dữ liệu chỉ nằm trong bộ nhớ (mất khi khởi động lại).
  Các repository là abstract class nên có thể thêm bản PostgreSQL mà không đổi use case.
- Chưa có endpoint OpenAPI (`/openapi/v1.json`).
- Tên ứng viên trong danh sách đơn ứng tuyển lấy từ repository ứng viên thay vì bảng tên cố định.
- Vượt giới hạn số kỹ năng trả HTTP 400 (bản C# trả 500 do ném `InvalidOperationException`).
