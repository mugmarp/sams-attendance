# SAMS Attendance - API Specification (OpenAPI 3.0)

```yaml
openapi: 3.0.3
info:
  title: SAMS Attendance API
  version: 1.0.0
  description: Student Attendance Management System for MUST
servers:
  - url: http://localhost:3000/api
    description: Development server
  - url: https://api.sams.must.ac.ug
    description: Production server

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Error:
      type: object
      properties:
        error:
          type: string
          enum: [VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, INTERNAL_ERROR]
        message:
          type: string
        details:
          type: array
          items:
            type: object
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
        role:
          type: string
          enum: [STUDENT, EXAMINER, ADMIN]
        regNo:
          type: string
          nullable: true
        name:
          type: string
        program:
          type: string
          nullable: true
        year:
          type: integer
          nullable: true
    AuthResponse:
      type: object
      properties:
        accessToken:
          type: string
        refreshToken:
          type: string
        user:
          $ref: '#/components/schemas/User'
    Session:
      type: object
      properties:
        id:
          type: string
        courseId:
          type: string
        courseCode:
          type: string
        courseTitle:
          type: string
        date:
          type: string
          format: date-time
        startTime:
          type: string
          format: date-time
        endTime:
          type: string
          format: date-time
        room:
          type: string
          nullable: true
        sessionType:
          type: string
          enum: [LECTURE, TUTORIAL, PRACTICAL, LAB, CLINICAL]
        checkinCode:
          type: string
          nullable: true
        codeExpiresAt:
          type: string
          format: date-time
          nullable: true
    CheckinResponse:
      type: object
      properties:
        code:
          type: string
        expiresAt:
          type: string
          format: date-time
    AttendanceRecord:
      type: object
      properties:
        id:
          type: string
        sessionId:
          type: string
        status:
          type: string
          enum: [PRESENT, ABSENT, LATE, EXCUSED]
        method:
          type: string
          enum: [CODE, QR, MANUAL, GEOFENCE]
        recordedAt:
          type: string
          format: date-time
    CheckinRequest:
      type: object
      required: [sessionId, code]
      properties:
        sessionId:
          type: string
        code:
          type: string
          pattern: '^[A-HJ-NP-Z2-9]{6}$'
    EligibilityStudent:
      type: object
      properties:
        regNo:
          type: string
        name:
          type: string
        presentCount:
          type: integer
        totalSessions:
          type: integer
        attendancePct:
          type: number
          format: float
        eligible:
          type: boolean
    EligibilityResponse:
      type: object
      properties:
        course:
          type: object
          properties:
            code:
              type: string
            title:
              type: string
        students:
          type: array
          items:
            $ref: '#/components/schemas/EligibilityStudent'
    PaginatedResponse:
      type: object
      properties:
        data:
          type: array
          items:
            type: object
        meta:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
    HealthResponse:
      type: object
      properties:
        status:
          type: string
        timestamp:
          type: string
          format: date-time
        uptime:
          type: number
        version:
          type: string

security:
  - bearerAuth: []

paths:
  /auth/login:
    post:
      summary: User login
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/refresh:
    post:
      summary: Refresh access token
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken]
              properties:
                refreshToken:
                  type: string
      responses:
        '200':
          description: New tokens issued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid refresh token

  /auth/me:
    get:
      summary: Get current user profile
      tags: [Auth]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: User profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

  /examiner/sessions/today:
    get:
      summary: Get today's sessions for examiner
      tags: [Examiner]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: List of sessions
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Session'

  /examiner/sessions/{id}:
    get:
      summary: Get session details
      tags: [Examiner]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Session details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
        '404':
          description: Session not found

  /examiner/sessions/{id}/start-checkin:
    post:
      summary: Generate/rotate check-in code
      tags: [Examiner]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Check-in code generated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CheckinResponse'
        '400':
          description: Session already has active code
        '404':
          description: Session not found

  /examiner/sessions/{id}/stop-checkin:
    post:
      summary: Invalidate check-in code
      tags: [Examiner]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Code invalidated
        '404':
          description: Session not found

  /examiner/sessions/{id}/attendance:
    get:
      summary: Get live attendance for session
      tags: [Examiner]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Attendance records
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/AttendanceRecord'

  /student/checkin:
    post:
      summary: Submit check-in code
      tags: [Student]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CheckinRequest'
      responses:
        '200':
          description: Attendance recorded
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  attendance:
                    $ref: '#/components/schemas/AttendanceRecord'
                  session:
                    type: object
                    properties:
                      courseCode:
                        type: string
                      date:
                        type: string
                        format: date
                      startTime:
                        type: string
        '400':
          description: Invalid/expired code or not enrolled
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: Already checked in for this session

  /student/attendance/summary:
    get:
      summary: Get own attendance summary
      tags: [Student]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Attendance per course
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    courseCode:
                      type: string
                    courseTitle:
                      type: string
                    presentCount:
                      type: integer
                    totalSessions:
                      type: integer
                    attendancePct:
                      type: number
                      format: float

  /student/sessions/upcoming:
    get:
      summary: Get upcoming sessions for enrolled courses
      tags: [Student]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Upcoming sessions
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Session'

  /admin/eligibility/{courseId}:
    get:
      summary: Get exam eligibility list for course
      tags: [Admin]
      security:
        - bearerAuth: []
      parameters:
        - name: courseId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Eligibility list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EligibilityResponse'
        '404':
          description: Course not found

  /admin/eligibility/{courseId}/pdf:
    get:
      summary: Export eligibility as PDF (Appendix D format)
      tags: [Admin]
      security:
        - bearerAuth: []
      parameters:
        - name: courseId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: PDF file
          content:
            application/pdf:
              schema:
                type: string
                format: binary
        '404':
          description: Course not found

  /admin/students:
    get:
      summary: List all students (paginated)
      tags: [Admin]
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: search
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Paginated students
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaginatedResponse'

  /admin/courses:
    get:
      summary: List all courses
      tags: [Admin]
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Course list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Session'

  /health:
    get:
      summary: Health check
      tags: [System]
      responses:
        '200':
          description: Service healthy
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
```