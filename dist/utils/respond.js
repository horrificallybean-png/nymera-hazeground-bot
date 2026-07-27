export function trimDiscord(text, limit = 1900) {
    return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
