# E-Posted & Meeting Scheduler - Database Summary

## 📊 Table Count Summary

### Total Tables: **11**

#### E-Posted Module: **5 tables**
1. `efiling_daak_categories` - Predefined categories
2. `efiling_daak` - Main daak/letter table
3. `efiling_daak_recipients` - Recipients (users, roles, groups, teams, departments, everyone)
4. `efiling_daak_acknowledgments` - Acknowledgments from recipients
5. `efiling_daak_attachments` - File attachments

#### Meeting Scheduler Module: **6 tables**
1. `efiling_meeting_settings` - System settings (SMTP, reminders, etc.)
2. `efiling_meetings` - Main meeting table
3. `efiling_meeting_attendees` - Internal attendees (efiling_users)
4. `efiling_meeting_external_attendees` - External attendees (via email)
5. `efiling_meeting_attachments` - Agenda and files
6. `efiling_meeting_reminders` - Reminder tracking

---

## 📋 Quick Reference

### E-Posted Features
- ✅ Create daak with subject, content, category, priority
- ✅ Send to: Users, Roles, Role Groups, Teams, Departments, or Everyone
- ✅ File attachments support
- ✅ Mandatory acknowledgments
- ✅ Track read/received/acknowledged status
- ✅ Public daak (visible to all)
- ✅ Expiration dates
- ✅ Internal notifications

### Meeting Scheduler Features
- ✅ **All users can create meetings** (no role restrictions)
- ✅ Create meetings with date, time, venue address
- ✅ Add meeting link (Google Meet, Zoom, or any platform)
- ✅ Meeting types: In-person, Virtual, Hybrid
- ✅ Internal invitations: Users, Roles, Role Groups, Teams
- ✅ External invitations: Via email (3rd party)
- ✅ SMTP email integration
- ✅ Agenda and attachments
- ✅ Response tracking (Accept/Decline/Tentative)
- ✅ Attendance tracking (Present/Absent/Late)
- ✅ Reminders (Email, SMS, In-app)
- ✅ Recurring meetings support
- ✅ Internal notifications

---

## 🔗 Relationships

### Uses Existing Tables:
- `efiling_users` - For creators, recipients, attendees
- `efiling_departments` - For department-based sending
- `efiling_roles` - For role-based sending
- `efiling_role_groups` - For group-based sending
- `efiling_user_teams` - For team-based sending
- `efiling_notifications` - For internal notifications
- `town`, `district`, `divisions` - Geographic data (via users)

### New Relationships:
- `efiling_daak` → `efiling_users` (created_by)
- `efiling_daak` → `efiling_daak_categories` (category_id)
- `efiling_daak_recipients` → `efiling_daak` (daak_id)
- `efiling_daak_recipients` → `efiling_users` (efiling_user_id)
- `efiling_daak_acknowledgments` → `efiling_daak` (daak_id)
- `efiling_daak_acknowledgments` → `efiling_users` (recipient_id)
- `efiling_meetings` → `efiling_users` (organizer_id)
- `efiling_meeting_attendees` → `efiling_meetings` (meeting_id)
- `efiling_meeting_attendees` → `efiling_users` (attendee_id)
- `efiling_meeting_external_attendees` → `efiling_meetings` (meeting_id)
- `efiling_meeting_reminders` → `efiling_meetings` (meeting_id)
- `efiling_meeting_reminders` → `efiling_users` (attendee_id, optional)

---

## 🚀 Next Steps

1. **Review the plan** (`EPOSTED_MEETING_PLAN.md`)
2. **Review the SQL script** (`create_eposted_meeting_modules.sql`)
3. **Approve the migration**
4. **Run the migration** on your database
5. **Start implementation** when ready

---

## 📝 Notes

- All tables include proper indexes for performance
- Foreign key constraints ensure data integrity
- Triggers automatically update `updated_at` timestamps
- Initial data includes default categories and settings
- Both modules integrate with existing notification system
- Email integration (SMTP) for Meeting Scheduler external attendees

---

## ✅ Ready to Proceed?

Once you approve, we can:
1. Run the migration script
2. Start building the backend APIs
3. Create the frontend pages
4. Integrate with existing systems

