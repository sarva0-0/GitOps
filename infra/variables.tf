variable "aws_region" {
  default = "us-east-1"
}

variable "instance_type" {
  default = "m7i-flex.large"
}

variable "key_name" {
  description = "Name of your AWS key pair"
  type        = string
}
