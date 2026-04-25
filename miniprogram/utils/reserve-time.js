function padNumber(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatTime(date) {
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getDefaultReserveTimeParts(now = new Date()) {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);

  if (next.getMinutes() <= 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }

  return {
    reserveDate: formatDate(next),
    reserveTime: formatTime(next)
  };
}

function buildReserveTimeValue(reserveDate, reserveTime) {
  if (!reserveDate || !reserveTime) {
    return '';
  }

  return `${reserveDate} ${reserveTime}`;
}

module.exports = {
  buildReserveTimeValue,
  getDefaultReserveTimeParts
};
