import React, { useState, useEffect } from "react";
import {
  FiCalendar,
  FiClock,
  FiRepeat,
  FiCheck,
  FiPlus,
  FiPlay,
  FiEdit2,
  FiTrash2,
  FiX,
  FiRefreshCw,
  FiAlertCircle,
} from "react-icons/fi";
import { AnimatedButton as Button } from "../components/MicroAnimations";
import Modal from "../components/Modal";
import { 
  getSchedules, 
  createSchedule, 
  updateSchedule, 
  deleteSchedule,
  runScheduleNow
} from "../api/schedulerService";
import { getFileCatalog } from "../api/fileService";
import LoadingSpinner from "../components/LoadingSpinner";
import PageHeader from "../components/PageHeader";
import "../components/styles/Scheduler.css";
import { formatRelativeTime } from "../utils/formatters";

const Scheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [formData, setFormData] = useState({
    fileId: "",
    frequency: "daily",
    time: "09:00",
    day: 1,
    isActive: true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Fetch schedules and files on load
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [schedulesData, filesData] = await Promise.all([
          getSchedules(),
          getFileCatalog(),
        ]);
        setSchedules(schedulesData);
        setFiles(filesData);
        setError(null);
      } catch (err) {
        console.error("Error fetching scheduler data:", err);
        setError("Failed to load schedule data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refresh schedules
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const schedulesData = await getSchedules();
      setSchedules(schedulesData);
      setError(null);
    } catch (err) {
      console.error("Error refreshing schedules:", err);
      setError("Failed to refresh schedules. Please try again later.");
    } finally {
      setRefreshing(false);
    }
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleFrequencySelect = (frequency) => {
    setFormData((prev) => ({ ...prev, frequency }));
  };

  // Modal handlers
  const openAddModal = () => {
    setFormData({
      fileId: files.length > 0 ? files[0].file_id : "",
      frequency: "daily",
      time: "09:00",
      day: 1,
      isActive: true,
    });
    setShowAddModal(true);
  };

  const openEditModal = (schedule) => {
    setSelectedSchedule(schedule);
    setFormData({
      fileId: schedule.file_id,
      frequency: schedule.frequency,
      time: schedule.time || "09:00",
      day: schedule.day || 1,
      isActive: schedule.is_active,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (schedule) => {
    setSelectedSchedule(schedule);
    setShowDeleteModal(true);
  };

  // CRUD operations
  const handleCreate = async () => {
    try {
      await createSchedule(formData);
      setShowAddModal(false);
      await handleRefresh();
    } catch (err) {
      console.error("Error creating schedule:", err);
      setError("Failed to create schedule. Please try again.");
    }
  };

  const handleUpdate = async () => {
    try {
      await updateSchedule(selectedSchedule.id, formData);
      setShowEditModal(false);
      await handleRefresh();
    } catch (err) {
      console.error("Error updating schedule:", err);
      setError("Failed to update schedule. Please try again.");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSchedule(selectedSchedule.id);
      setShowDeleteModal(false);
      await handleRefresh();
    } catch (err) {
      console.error("Error deleting schedule:", err);
      setError("Failed to delete schedule. Please try again.");
    }
  };

  const handleRunNow = async (scheduleId) => {
    try {
      await runScheduleNow(scheduleId);
      await handleRefresh();
    } catch (err) {
      console.error("Error running schedule:", err);
      setError("Failed to run schedule. Please try again.");
    }
  };

  // Render frequency text
  const renderFrequencyText = (schedule) => {
    switch (schedule.frequency) {
      case "hourly":
        return "Every hour";
      case "daily":
        return `Every day at ${schedule.time || "00:00"}`;
      case "weekly":
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return `Every ${days[schedule.day || 0]} at ${schedule.time || "00:00"}`;
      case "monthly":
        return `Day ${schedule.day || 1} of each month at ${schedule.time || "00:00"}`;
      default:
        return "Custom schedule";
    }
  };

  // Get file name from file ID
  const getFileName = (fileId) => {
    const file = files.find((f) => f.file_id === fileId);
    return file ? file.filename : "Unknown file";
  };

  // Render schedule form (for add/edit modals)
  const renderScheduleForm = () => (
    <div className="schedule-form">
      <div className="form-group">
        <label htmlFor="fileId">Select File</label>
        <select
          id="fileId"
          name="fileId"
          className="form-control"
          value={formData.fileId}
          onChange={handleInputChange}
          required
        >
          <option value="">Select a file</option>
          {files.map((file) => (
            <option key={file.file_id} value={file.file_id}>
              {file.filename}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Frequency</label>
        <div className="frequency-options">
          {["hourly", "daily", "weekly", "monthly"].map((freq) => (
            <div
              key={freq}
              className={`frequency-option ${
                formData.frequency === freq ? "frequency-option-active" : ""
              }`}
              onClick={() => handleFrequencySelect(freq)}
            >
              {freq.charAt(0).toUpperCase() + freq.slice(1)}
            </div>
          ))}
        </div>
      </div>

      {formData.frequency !== "hourly" && (
        <div className="form-group">
          <label htmlFor="time">Time</label>
          <input
            type="time"
            id="time"
            name="time"
            className="form-control"
            value={formData.time}
            onChange={handleInputChange}
          />
        </div>
      )}

      {formData.frequency === "weekly" && (
        <div className="form-group">
          <label htmlFor="day">Day of Week</label>
          <select
            id="day"
            name="day"
            className="form-control"
            value={formData.day}
            onChange={handleInputChange}
          >
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select>
        </div>
      )}

      {formData.frequency === "monthly" && (
        <div className="form-group">
          <label htmlFor="day">Day of Month</label>
          <select
            id="day"
            name="day"
            className="form-control"
            value={formData.day}
            onChange={handleInputChange}
          >
            {[...Array(31)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="isActive">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            checked={formData.isActive}
            onChange={handleInputChange}
          />
          {" "}Active
        </label>
      </div>
    </div>
  );

  return (
    <div className="schedule-page">
      <PageHeader
        title="File Scheduler"
        subtitle="Schedule automated file processing tasks"
        icon={<FiCalendar />}
        actions={
          <Button
            variant="primary"
            onClick={openAddModal}
            icon={<FiPlus />}
            disabled={files.length === 0}
          >
            New Schedule
          </Button>
        }
      />

      {error && (
        <div className="alert alert-error">
          <FiAlertCircle /> {error}
        </div>
      )}

      <div className="schedule-container">
        <div className="schedule-header">
          <h2>Active Schedules</h2>
          <Button
            variant="text"
            onClick={handleRefresh}
            icon={<FiRefreshCw />}
            loading={refreshing}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : schedules.length > 0 ? (
          <div className="schedule-list">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="schedule-item">
                <div className="schedule-info">
                  <div className="schedule-file-name">
                    {getFileName(schedule.file_id)}
                    <span
                      className={`schedule-tag ${
                        schedule.is_active
                          ? "schedule-tag-active"
                          : "schedule-tag-inactive"
                      }`}
                    >
                      {schedule.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="schedule-details">
                    <div className="schedule-detail">
                      <FiRepeat className="schedule-icon" />
                      {renderFrequencyText(schedule)}
                    </div>
                    {schedule.next_run && (
                      <div className="schedule-detail">
                        <FiClock className="schedule-icon" />
                        Next run: {formatRelativeTime(new Date(schedule.next_run))}
                      </div>
                    )}
                    {schedule.last_run && (
                      <div className="schedule-detail">
                        <FiCheck className="schedule-icon" />
                        Last run: {formatRelativeTime(new Date(schedule.last_run))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="schedule-actions">
                  <Button
                    variant="icon"
                    onClick={() => handleRunNow(schedule.id)}
                    title="Run Now"
                    icon={<FiPlay />}
                  />
                  <Button
                    variant="icon"
                    onClick={() => openEditModal(schedule)}
                    title="Edit"
                    icon={<FiEdit2 />}
                  />
                  <Button
                    variant="icon"
                    onClick={() => openDeleteModal(schedule)}
                    title="Delete"
                    color="danger"
                    icon={<FiTrash2 />}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FiCalendar />
            </div>
            <h3 className="empty-state-title">No Schedules Found</h3>
            <p className="empty-state-description">
              You haven't created any file processing schedules yet.
            </p>
            <Button
              variant="primary"
              onClick={openAddModal}
              icon={<FiPlus />}
              disabled={files.length === 0}
            >
              Create Your First Schedule
            </Button>
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New Schedule"
        footer={
          <>
            <Button variant="text" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!formData.fileId}
            >
              Create Schedule
            </Button>
          </>
        }
      >
        {renderScheduleForm()}
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Schedule"
        footer={
          <>
            <Button variant="text" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdate}
              disabled={!formData.fileId}
            >
              Save Changes
            </Button>
          </>
        }
      >
        {renderScheduleForm()}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Schedule"
        footer={
          <>
            <Button variant="text" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete the schedule for{" "}
          <strong>
            {selectedSchedule && getFileName(selectedSchedule.file_id)}
          </strong>
          ?
        </p>
        <p>This action cannot be undone.</p>
      </Modal>
    </div>
  );
};

export default Scheduler;