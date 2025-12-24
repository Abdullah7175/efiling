# E-Posted & Meeting Scheduler Modules - Implementation Plan

## Overview
Two new modules for the e-filing system:
1. **E-Posted (Daak System)** - Legacy-based notification/letter system
2. **Meeting Scheduler** - Meeting management with internal and external invitations

Both modules will:
- Use existing users, departments, roles, role groups, teams, towns, districts, divisions
- Be accessible to `efiling` and `efilingusers` roles
- Send notifications via existing `efiling_notifications` system
- Support email notifications for external users (Meeting Scheduler only)

---

## Module 1: E-Posted (Daak System)

### Purpose
A notification/letter system where higher authorities can send official notices (daak/khat/chithii) to:
- All users
- Specific users
- Specific roles
- Specific role groups
- Specific teams
- Specific departments

All recipients must acknowledge receipt of the daak.

### Features
1. **Create Daak**: Higher authorities can create and send daak
2. **Recipient Selection**: Send to users, roles, groups, teams, departments, or everyone
3. **Attachments**: Support file attachments
4. **Acknowledgment Required**: All recipients must acknowledge receipt
5. **Tracking**: Track who received, read, and acknowledged
6. **Categories**: Organize daak by type (Promotion, Transfer, Notice, Announcement, etc.)
7. **Priority Levels**: Urgent, High, Normal, Low
8. **Notifications**: Internal notifications sent to all recipients

### Database Tables (5 tables)

#### 1. `efiling_daak` (Main daak/letter table)
- id, daak_number (unique), subject, content, category, priority
- created_by (efiling_users.id), department_id, role_id
- is_urgent, is_public (visible to all), expires_at
- status (DRAFT, SENT, CANCELLED)
- created_at, updated_at, sent_at

#### 2. `efiling_daak_recipients` (Who receives the daak)
- id, daak_id, recipient_type (USER, ROLE, ROLE_GROUP, TEAM, DEPARTMENT, EVERYONE)
- recipient_id (user_id, role_id, role_group_id, team_id, department_id, or NULL for EVERYONE)
- status (PENDING, SENT, RECEIVED, ACKNOWLEDGED)
- received_at, acknowledged_at
- created_at, updated_at

#### 3. `efiling_daak_acknowledgments` (Acknowledgments from recipients)
- id, daak_id, recipient_id (efiling_users.id)
- acknowledgment_text (optional comment)
- acknowledged_at, ip_address, user_agent
- created_at

#### 4. `efiling_daak_attachments` (File attachments)
- id, daak_id, file_name, file_path, file_size, file_type
- uploaded_by, created_at

#### 5. `efiling_daak_categories` (Predefined categories)
- id, name, code, description, icon, color
- is_active, created_at, updated_at

---

## Module 2: Meeting Scheduler

### Purpose
A meeting management system similar to Google Meet where:
- **All roles can create meetings** (not restricted to specific roles)
- Invite internal users (by user, role, group, team)
- Invite external users via email (3rd party members)
- Send email invitations using SMTP
- Track attendance and responses
- Support meeting agenda and attachments
- Send reminders and notifications
- Add venue/address for in-person meetings
- Add meeting links (Google Meet, Zoom, or any virtual meeting platform)

### Features
1. **Create Meeting**: All users can schedule meetings with date, time, duration
2. **Venue/Address**: Add physical venue address for in-person or hybrid meetings
3. **Meeting Link**: Add virtual meeting link (Google Meet, Zoom, or any platform) for virtual or hybrid meetings
4. **Internal Invitations**: Invite by user, role, role group, team
5. **External Invitations**: Invite via email (3rd party)
6. **Email Integration**: SMTP for sending invitations
7. **Meeting Types**: In-person, Virtual (with meeting link), Hybrid (both venue and link)
8. **Agenda & Attachments**: Add agenda items and files
9. **Reminders**: Automatic reminders before meeting
10. **Attendance Tracking**: Track who attended, declined, or was absent
11. **Notifications**: Internal notifications for all internal attendees
12. **Recurring Meetings**: Support recurring meetings (optional for future)

### Database Tables (6 tables)

#### 1. `efiling_meetings` (Main meeting table)
- id, meeting_number (unique), title, description, agenda
- meeting_type (IN_PERSON, VIRTUAL, HYBRID)
- meeting_date, start_time, end_time, duration_minutes
- venue_address (physical venue/address for in-person or hybrid meetings)
- meeting_link (Google Meet, Zoom, or any virtual meeting platform URL)
- organizer_id (efiling_users.id), department_id
- status (SCHEDULED, ONGOING, COMPLETED, CANCELLED, POSTPONED)
- is_recurring, recurrence_pattern (JSON)
- reminder_sent, reminder_sent_at
- created_at, updated_at, started_at, ended_at

#### 2. `efiling_meeting_attendees` (Internal attendees)
- id, meeting_id, attendee_id (efiling_users.id)
- attendee_type (USER, ROLE, ROLE_GROUP, TEAM)
- source_id (if invited via role/group/team, store the source)
- response_status (PENDING, ACCEPTED, DECLINED, TENTATIVE)
- attendance_status (PRESENT, ABSENT, LATE, LEFT_EARLY)
- responded_at, attended_at, left_at
- notes (optional notes from attendee)
- created_at, updated_at

#### 3. `efiling_meeting_external_attendees` (External/email attendees)
- id, meeting_id, email, name, designation, organization
- response_status (PENDING, ACCEPTED, DECLINED, TENTATIVE)
- attendance_status (PRESENT, ABSENT, LATE, LEFT_EARLY)
- invitation_sent, invitation_sent_at, email_sent_count
- responded_at, responded_via (EMAIL_LINK, EMAIL_REPLY)
- response_token (unique token for email response)
- attended_at, left_at, notes
- created_at, updated_at

#### 4. `efiling_meeting_attachments` (Agenda items and files)
- id, meeting_id, file_name, file_path, file_size, file_type
- attachment_type (AGENDA, DOCUMENT, PRESENTATION, OTHER)
- uploaded_by, description
- created_at

#### 5. `efiling_meeting_reminders` (Reminder tracking)
- id, meeting_id, attendee_id (efiling_users.id or NULL for external)
- external_email (if external attendee)
- reminder_type (EMAIL, SMS, IN_APP)
- reminder_sent_at, reminder_sent_status (SUCCESS, FAILED)
- reminder_minutes_before (15, 30, 60, 1440 for 1 day)
- created_at

#### 6. `efiling_meeting_settings` (System settings for meetings)
- id, setting_key, setting_value (JSON)
- description, updated_by, updated_at
- Examples: default_reminder_minutes, smtp_config, timezone

---

## Shared Components

### Notifications
Both modules will use the existing `efiling_notifications` table:
- **E-Posted**: `type = 'DAAK_RECEIVED', 'DAAK_ACKNOWLEDGMENT_REQUIRED'`
- **Meeting**: `type = 'MEETING_INVITATION', 'MEETING_REMINDER', 'MEETING_STARTING'`

### Email Integration (Meeting Scheduler)
- SMTP configuration stored in `efiling_meeting_settings`
- Email templates for invitations and reminders
- Email tracking for external attendees

### Permissions
- **E-Posted**: 
  - `can_create_daak` (higher authorities only)
  - `can_view_daak` (all users)
  - `can_acknowledge_daak` (all users)
- **Meeting Scheduler**:
  - `can_create_meeting` (all users - no restrictions)
  - `can_view_meetings` (all users)
  - `can_manage_meetings` (organizers can manage their own meetings)

---

## Table Summary

### E-Posted Module: 5 tables
1. `efiling_daak`
2. `efiling_daak_recipients`
3. `efiling_daak_acknowledgments`
4. `efiling_daak_attachments`
5. `efiling_daak_categories`

### Meeting Scheduler Module: 6 tables
1. `efiling_meetings`
2. `efiling_meeting_attendees`
3. `efiling_meeting_external_attendees`
4. `efiling_meeting_attachments`
5. `efiling_meeting_reminders`
6. `efiling_meeting_settings`

### Total: 11 new tables

---

## Implementation Phases

### Phase 1: Database Setup
- Create all 11 tables with proper indexes and constraints
- Add foreign key relationships
- Create initial data (categories, settings)

### Phase 2: E-Posted Backend
- API routes for creating daak
- API routes for viewing daak
- API routes for acknowledgments
- Recipient expansion logic (expand roles/groups/teams to users)

### Phase 3: E-Posted Frontend
- Create daak page
- View daak list page
- Daak detail page with acknowledgment
- Dashboard widget

### Phase 4: Meeting Scheduler Backend
- API routes for creating meetings
- API routes for managing attendees
- Email integration (SMTP)
- Reminder system

### Phase 5: Meeting Scheduler Frontend
- Create meeting page
- Meeting list/calendar view
- Meeting detail page
- External attendee management

### Phase 6: Integration
- Add navigation links
- Add to dashboard
- Notification integration
- Email templates

---

## Next Steps
1. Review and approve this plan
2. Create SQL migration scripts for all 11 tables
3. Wait for approval before starting implementation

