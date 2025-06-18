#!/bin/bash
# Camera Reset Sudo Setup Script
# This script creates a sudoers configuration to allow specific camera reset commands
# without requiring a password, enhancing the photobooth's camera reset functionality.

set -e
echo "Setting up passwordless sudo for camera reset operations..."

# Define the username (current user by default)
USERNAME=$(whoami)
echo "Setting up passwordless sudo for user: $USERNAME"

# Location of the sudoers.d directory
SUDOERS_DIR="/etc/sudoers.d"
SUDOERS_FILE="$SUDOERS_DIR/photobooth-camera"

# Create a temporary file
TEMP_FILE=$(mktemp)

# Write the sudo rules to the temporary file
cat > $TEMP_FILE << EOF
# Photobooth Camera Reset Operations
# Allow user to run specific camera-related commands without a password
$USERNAME ALL=(ALL) NOPASSWD: /sbin/modprobe -r v4l2loopback
$USERNAME ALL=(ALL) NOPASSWD: /sbin/modprobe v4l2loopback *
$USERNAME ALL=(ALL) NOPASSWD: /usr/bin/fuser -k /dev/video*
EOF

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
  echo "This script needs to be run with sudo."
  echo "Please run: sudo $0"
  exit 1
fi

# Verify the temporary file is valid
echo "Verifying sudoers syntax..."
visudo -c -f $TEMP_FILE
if [ $? -ne 0 ]; then
  echo "Error: Invalid sudoers syntax."
  rm $TEMP_FILE
  exit 1
fi

# Move the temporary file to the sudoers.d directory
echo "Installing sudoers configuration..."
mv $TEMP_FILE $SUDOERS_FILE
chmod 440 $SUDOERS_FILE

echo "Setting proper permissions..."
chown root:root $SUDOERS_FILE

echo "Verifying installation..."
ls -la $SUDOERS_FILE

echo "Done! The following commands can now be executed with sudo without password:"
echo "  - sudo /sbin/modprobe -r v4l2loopback"
echo "  - sudo /sbin/modprobe v4l2loopback [with any parameters]"
echo "  - sudo /usr/bin/fuser -k /dev/video*"
echo ""
echo "The photobooth camera reset functionality should now work properly."
