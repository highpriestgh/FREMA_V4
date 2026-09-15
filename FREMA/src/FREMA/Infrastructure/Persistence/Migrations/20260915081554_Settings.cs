using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FREMA.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Settings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkflowRoutings_DueDate",
                table: "WorkflowRoutings");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastReminderAt",
                table: "WorkflowRoutings",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DocumentNumberCounters",
                columns: table => new
                {
                    Scope = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    LastValue = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentNumberCounters", x => x.Scope);
                });

            migrationBuilder.CreateTable(
                name: "SystemSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    OrganisationName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LogoContent = table.Column<byte[]>(type: "varbinary(max)", nullable: true),
                    LogoContentType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    LogoUpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    NumberPrefix = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    NumberIncludesYear = table.Column<bool>(type: "bit", nullable: false),
                    NumberDigits = table.Column<int>(type: "int", nullable: false),
                    NumberResetsYearly = table.Column<bool>(type: "bit", nullable: false),
                    DefaultDueDays = table.Column<int>(type: "int", nullable: true),
                    RemindersEnabled = table.Column<bool>(type: "bit", nullable: false),
                    ReminderDueSoonHours = table.Column<int>(type: "int", nullable: false),
                    ReminderRepeatHours = table.Column<int>(type: "int", nullable: false),
                    AllowedExtensions = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    MaxUploadMegabytes = table.Column<int>(type: "int", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemSettings", x => x.Id);
                    table.CheckConstraint("CK_SystemSettings_Singleton", "[Id] = 1");
                });

            migrationBuilder.InsertData(
                table: "SystemSettings",
                columns: new[] { "Id", "AllowedExtensions", "DefaultDueDays", "LogoContent", "LogoContentType", "LogoUpdatedAt", "MaxUploadMegabytes", "NumberDigits", "NumberIncludesYear", "NumberPrefix", "NumberResetsYearly", "OrganisationName", "ReminderDueSoonHours", "ReminderRepeatHours", "RemindersEnabled", "UpdatedAt", "UpdatedBy" },
                values: new object[] { 1, ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt", 5, null, null, null, 50, 6, true, "FR", true, "FREMA", 24, 24, true, null, null });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRoutings_Status_DueDate",
                table: "WorkflowRoutings",
                columns: new[] { "Status", "DueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DocumentNumberCounters");

            migrationBuilder.DropTable(
                name: "SystemSettings");

            migrationBuilder.DropIndex(
                name: "IX_WorkflowRoutings_Status_DueDate",
                table: "WorkflowRoutings");

            migrationBuilder.DropColumn(
                name: "LastReminderAt",
                table: "WorkflowRoutings");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRoutings_DueDate",
                table: "WorkflowRoutings",
                column: "DueDate");
        }
    }
}
