import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LoginService } from '../../application/auth/login.service';
import { PasswordChangeService } from '../../application/auth/password-change.service';
import { RegistrationService } from '../../application/auth/registration.service';
import { SessionService } from '../../application/auth/session.service';
import type { AuthenticatedUserDto } from '../../application/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  AuthenticatedUserResponseDto,
  ChangePasswordDto,
  LoginDto,
  LoginResultResponseDto,
  RefreshTokenDto,
  RegisterCandidateDto,
} from '../dto/auth.dto';
import { AuthPrincipal, CurrentUser, JwtAuthGuard } from '../auth/auth';

@ApiTags('Xác thực')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
    private readonly registrationService: RegistrationService,
    private readonly passwordChangeService: PasswordChangeService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập, nhận access token và refresh token' })
  @ApiOkResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  login(@Body() body: LoginDto) {
    return this.loginService.login(body.email, body.password);
  }

  @Post('register/candidate')
  @ApiOperation({
    summary: 'Đăng ký tài khoản ứng viên',
    description:
      'Tạo đồng thời tài khoản và hồ sơ, rồi cấp phiên đăng nhập đầu tiên.',
  })
  @ApiCreatedResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  registerCandidate(@Body() body: RegisterCandidateDto) {
    return this.registrationService.registerCandidate(
      body.name,
      body.email,
      body.password,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Làm mới phiên bằng refresh token',
    description:
      'Refresh token xoay vòng: mỗi token dùng được một lần. Dùng lại token đã thu hồi sẽ thu hồi toàn bộ phiên cùng họ token.',
  })
  @ApiOkResponse({ type: LoginResultResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  refresh(@Body() body: RefreshTokenDto) {
    return this.sessionService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất, thu hồi refresh token hiện tại' })
  @ApiNoContentResponse()
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.sessionService.logout(body.refreshToken);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đổi mật khẩu',
    description: 'Thu hồi toàn bộ phiên đăng nhập hiện có của tài khoản.',
  })
  @ApiNoContentResponse()
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.passwordChangeService.change(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người dùng hiện tại' })
  @ApiOkResponse({ type: AuthenticatedUserResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  me(@CurrentUser() user: AuthPrincipal): AuthenticatedUserDto {
    return { ...user };
  }
}
