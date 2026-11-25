export async function readExcelRows(file) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('请选择 .xlsx 工作簿。');
    const { readSheet } = await import('read-excel-file/browser');
    try {
        return await readSheet(file);
    } catch {
        throw new Error('无法读取工作簿，请检查文件是否损坏或受密码保护。');
    }
}
