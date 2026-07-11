function normalizeDeviceValue(value) {
  return String(value || '').trim();
}

function validateDeviceBinding({ employee, deviceId, employees, tenantId }) {
  if (!employee) {
    return { allowed: false, reason: 'Employee not found' };
  }

  const normalizedDeviceId = normalizeDeviceValue(deviceId);
  const normalizedTenantId = String(tenantId || employee.tenantId || '').toLowerCase();
  const normalizedEmployeeId = String(employee.employeeId || '').trim().toLowerCase();

  if (!normalizedDeviceId) {
    return { allowed: false, reason: 'Device ID is required' };
  }

  const currentDeviceId = normalizeDeviceValue(employee.registeredDeviceId || employee.deviceId);

  if (currentDeviceId && currentDeviceId !== normalizedDeviceId) {
    return {
      allowed: false,
      reason: 'This employee is already linked to another device.'
    };
  }

  const conflictingOwner = (employees || []).find(candidate => {
    if (!candidate) return false;
    if (String(candidate.employeeId || '').trim().toLowerCase() === normalizedEmployeeId) {
      return false;
    }

    const candidateTenantId = String(candidate.tenantId || '').toLowerCase();
    if (candidateTenantId !== normalizedTenantId) {
      return false;
    }

    const candidateDeviceId = normalizeDeviceValue(candidate.registeredDeviceId || candidate.deviceId);
    return candidateDeviceId && candidateDeviceId === normalizedDeviceId;
  });

  if (conflictingOwner) {
    return {
      allowed: false,
      reason: 'This device is already linked to another employee.'
    };
  }

  return { allowed: true };
}

module.exports = {
  validateDeviceBinding
};
