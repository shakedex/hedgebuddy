// Package icons exposes Lucide SVG resources for the UI.
// SVGs are vendored under svg/ and embedded at compile time.
package icons

import (
	_ "embed"

	"fyne.io/fyne/v2"
)

//go:embed svg/plus.svg
var plusData []byte
var Plus = &fyne.StaticResource{StaticName: "plus.svg", StaticContent: plusData}

//go:embed svg/download.svg
var downloadData []byte
var Download = &fyne.StaticResource{StaticName: "download.svg", StaticContent: downloadData}

//go:embed svg/upload.svg
var uploadData []byte
var Upload = &fyne.StaticResource{StaticName: "upload.svg", StaticContent: uploadData}

//go:embed svg/search.svg
var searchData []byte
var Search = &fyne.StaticResource{StaticName: "search.svg", StaticContent: searchData}

//go:embed svg/x.svg
var xData []byte
var X = &fyne.StaticResource{StaticName: "x.svg", StaticContent: xData}

//go:embed svg/pencil.svg
var pencilData []byte
var Pencil = &fyne.StaticResource{StaticName: "pencil.svg", StaticContent: pencilData}

//go:embed svg/copy.svg
var copyData []byte
var Copy = &fyne.StaticResource{StaticName: "copy.svg", StaticContent: copyData}

//go:embed svg/copy-plus.svg
var copyPlusData []byte
var CopyPlus = &fyne.StaticResource{StaticName: "copy-plus.svg", StaticContent: copyPlusData}

//go:embed svg/trash-2.svg
var trash2Data []byte
var Trash = &fyne.StaticResource{StaticName: "trash-2.svg", StaticContent: trash2Data}

//go:embed svg/eye.svg
var eyeData []byte
var Eye = &fyne.StaticResource{StaticName: "eye.svg", StaticContent: eyeData}

//go:embed svg/eye-off.svg
var eyeOffData []byte
var EyeOff = &fyne.StaticResource{StaticName: "eye-off.svg", StaticContent: eyeOffData}

//go:embed svg/file.svg
var fileData []byte
var File = &fyne.StaticResource{StaticName: "file.svg", StaticContent: fileData}

//go:embed svg/folder-open.svg
var folderOpenData []byte
var FolderOpen = &fyne.StaticResource{StaticName: "folder-open.svg", StaticContent: folderOpenData}

//go:embed svg/ellipsis.svg
var ellipsisData []byte
var Ellipsis = &fyne.StaticResource{StaticName: "ellipsis.svg", StaticContent: ellipsisData}

//go:embed svg/settings.svg
var settingsData []byte
var Settings = &fyne.StaticResource{StaticName: "settings.svg", StaticContent: settingsData}

//go:embed svg/info.svg
var infoData []byte
var Info = &fyne.StaticResource{StaticName: "info.svg", StaticContent: infoData}

//go:embed svg/check.svg
var checkData []byte
var Check = &fyne.StaticResource{StaticName: "check.svg", StaticContent: checkData}

//go:embed svg/arrow-left.svg
var arrowLeftData []byte
var ArrowLeft = &fyne.StaticResource{StaticName: "arrow-left.svg", StaticContent: arrowLeftData}

//go:embed svg/database-zap.svg
var databaseZapData []byte
var DatabaseZap = &fyne.StaticResource{StaticName: "database-zap.svg", StaticContent: databaseZapData}

//go:embed svg/external-link.svg
var externalLinkData []byte
var ExternalLink = &fyne.StaticResource{StaticName: "external-link.svg", StaticContent: externalLinkData}

//go:embed svg/refresh-cw.svg
var refreshCwData []byte
var RefreshCw = &fyne.StaticResource{StaticName: "refresh-cw.svg", StaticContent: refreshCwData}

//go:embed svg/chevron-right.svg
var chevronRightData []byte
var ChevronRight = &fyne.StaticResource{StaticName: "chevron-right.svg", StaticContent: chevronRightData}

//go:embed svg/chevron-down.svg
var chevronDownData []byte
var ChevronDown = &fyne.StaticResource{StaticName: "chevron-down.svg", StaticContent: chevronDownData}

//go:embed svg/triangle-alert.svg
var triangleAlertData []byte
var TriangleAlert = &fyne.StaticResource{StaticName: "triangle-alert.svg", StaticContent: triangleAlertData}

//go:embed svg/cloud-download.svg
var cloudDownloadData []byte
var CloudDownload = &fyne.StaticResource{StaticName: "cloud-download.svg", StaticContent: cloudDownloadData}
