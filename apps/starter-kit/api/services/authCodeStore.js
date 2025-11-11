const MAX_RECORDS = 50;

const records = [];

function addAuthCodeRecord(record) {
  const entry = {
    ...record,
    receivedAt: new Date().toISOString(),
  };
  records.unshift(entry);
  if (records.length > MAX_RECORDS) {
    records.pop();
  }
  return entry;
}

function getAuthCodeRecords() {
  return records;
}

function getLatestAuthCodeRecord() {
  return records[0] ?? null;
}

export { addAuthCodeRecord, getAuthCodeRecords, getLatestAuthCodeRecord };
