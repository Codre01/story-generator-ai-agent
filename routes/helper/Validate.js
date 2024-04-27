
exports.Validate = {
    email: email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    URL: url => /^(ftp|http|https):\/\/[^ "]+$/.test(url),
    phone: phone => /^[0-9]+$/.test(phone),
    integer: value => Number.isInteger(value),
    positiveInteger: value => Number.isInteger(value) && value >= 0,
    string: value => typeof value === 'string' && value.trim() !== '',
    array: value => Array.isArray(value) && value.length > 0,
    object: value => typeof value === 'object' && value !== null && Object.keys(value).length > 0,
    ISODate: (dateString) => !isNaN(Date.parse(dateString)) && new Date(dateString).toISOString() === dateString,
    date: (dateString) => /^\d{4}-\d{2}-\d{2}$/.test(dateString) && !isNaN(new Date(dateString).getTime()),
    time: (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time),
    datetime: (dateString) => !isNaN(Date.parse(dateString)) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString),
    formatPhone: (phone) => {
        let inputString = phone.split(' ').join('')
            .split('+').join('')
            .split('-').join('')
            .split('(').join('')
            .split(')').join('');
        if (inputString.startsWith('009')) {
            return inputString.slice(3);
        } else if (inputString.startsWith('0')) {
            return '234' + inputString.slice(1);
        } else {
            return inputString;
        }
    },
};