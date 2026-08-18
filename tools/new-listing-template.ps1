# GDE Collectibles reusable listing template
# ------------------------------------------------------------
# How to use:
# 1. Edit the values below for the new listing.
# 2. Keep the id short, lowercase, and URL-safe, for example: royal-1911.
# 3. Put listing photos in assets\listings\<id>\. The generator will attach them automatically.
# 4. Run this script from the repository root:
#    powershell -ExecutionPolicy Bypass -File tools\new-listing-template.ps1
#
# Available built-in fallback image styles:
# image-presidential
# image-heritage
# image-gold
# image-wildlife
# image-rifle
# image-silver
# image-archive
#
# Good availability values:
# Available
# Limited Availability
# Sold / Archive

$Listing = @{
  id = "new-listing-slug"
  name = "New Listing Name"
  collection = "Collection Name"
  type = "Pistol"
  manufacturer = ""
  model = ""
  caliber = ""
  platform = ".45 ACP"
  frameColor = ""
  gripColor = ""
  action = ""
  adjustableSights = ""
  barrelLength = ""
  capacity = ""
  frameMaterial = ""
  gripMaterial = ""
  finish = ""
  price = "0"
  availability = "Available"
  image = "image-gold"
  description = ""
}

$NodePath = "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$AdminScript = Join-Path $PSScriptRoot "codex-inventory-admin.mjs"

if (-not (Test-Path -LiteralPath $NodePath)) {
  throw "Node runtime not found at $NodePath"
}

if (-not (Test-Path -LiteralPath $AdminScript)) {
  throw "Inventory admin script not found at $AdminScript"
}

if ([string]::IsNullOrWhiteSpace($Listing.id) -or $Listing.id -eq "new-listing-slug") {
  throw "Change `$Listing.id and the other listing values before running this script."
}

if ($Listing.id -notmatch "^[a-z0-9]+(?:-[a-z0-9]+)*$") {
  throw "The listing ID can only contain lowercase letters, numbers, and hyphens."
}

if ([string]::IsNullOrWhiteSpace($Listing.name)) {
  throw "Enter a listing name."
}

if ([string]::IsNullOrWhiteSpace($Listing.manufacturer)) {
  throw "Enter the manufacturer."
}

if ([string]::IsNullOrWhiteSpace($Listing.model)) {
  throw "Enter the model."
}

if ([string]::IsNullOrWhiteSpace($Listing.caliber)) {
  throw "Enter the caliber."
}

if ($Listing.price -notmatch "^\d+(\.\d{1,2})?$") {
  throw "Enter the price as a number without a dollar sign or commas. Example: 5000"
}

$Args = @(
  "add"
  "id=$($Listing.id)"
  "name=$($Listing.name)"
  "collection=$($Listing.collection)"
  "type=$($Listing.type)"
  "manufacturer=$($Listing.manufacturer)"
  "model=$($Listing.model)"
  "caliber=$($Listing.caliber)"
  "platform=$($Listing.platform)"
  "frameColor=$($Listing.frameColor)"
  "gripColor=$($Listing.gripColor)"
  "action=$($Listing.action)"
  "adjustableSights=$($Listing.adjustableSights)"
  "barrelLength=$($Listing.barrelLength)"
  "capacity=$($Listing.capacity)"
  "frameMaterial=$($Listing.frameMaterial)"
  "gripMaterial=$($Listing.gripMaterial)"
  "finish=$($Listing.finish)"
  "price=$($Listing.price)"
  "availability=$($Listing.availability)"
  "image=$($Listing.image)"
  "description=$($Listing.description)"
)

& $NodePath $AdminScript @Args

Write-Host ""
Write-Host "Listing generated in the Git repository."
Write-Host "Review the site, then commit and push the changed files."
